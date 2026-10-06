import "dotenv/config";
import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AnnouncementRouteStatus,
  AudioAssetStatus,
  AudioCategory,
  PrismaClient,
} from "@prisma/client";
import { Pool } from "pg";

type LegacyStop = { name: string; audioFile: string };
type LegacyRoute = { routeNumber: string; routeName: string; stops: LegacyStop[] };

const ROUTES = {
  "ST-A02": { origin: "Hyderabad", destination: "Kakinada", via: "Mandapeta", busType: "AC" },
  "ST-A04": { origin: "Hyderabad", destination: "Kakinada", via: "Rajahmundry", busType: "AC" },
  "ST-VH02": { origin: "Hyderabad", destination: "Visakhapatnam", via: "Vijayawada, Rajahmundry", busType: "AC" },
  "ST-12": { origin: "Hyderabad", destination: "Kakinada", via: "Mandapeta", busType: "Non-AC" },
} as const;

// This order mirrors the legacy audioAssets.ts registry. Later directories win
// when the old application mapped the same file name more than once.
const LEGACY_DIRECTORY_ORDER = [
  "HydStops", "VizagStops", "RjyStops", "KKDStops", "ST-12", "ST-122",
  "ST-A02", "ST-A04", "ST-A06", "ST-VH02", "QA", "welcomenotes",
] as const;

const defaultAudioRoot = path.resolve(
  process.cwd(), "..", "..", "samanvibusroutevoiceappExpo", "assets", "audio",
);
const audioRoot = path.resolve(process.env["ANNOUNCEMENT_AUDIO_SOURCE_DIR"] ?? defaultAudioRoot);
const dryRun = process.argv.includes("--dry-run");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function routeCode(value: string): string {
  return value.replace(/\s+/g, "");
}

function mimeType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".mpeg") return "audio/mpeg";
  throw new Error(`Unsupported seed audio format: ${file}`);
}

function titleFromFile(file: string): string {
  return path.basename(file, path.extname(file))
    .replace(/^\d+[.]?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

async function legacyRoutes(): Promise<LegacyRoute[]> {
  const legacyRoot = path.resolve(audioRoot, "..", "..");
  const modulePath = path.join(legacyRoot, "data", "busRoutes.ts");
  await access(modulePath);
  const imported = await import(pathToFileURL(modulePath).href) as { busRoutes?: LegacyRoute[] };
  if (!Array.isArray(imported.busRoutes)) throw new Error(`No busRoutes export in ${modulePath}`);
  return imported.busRoutes;
}

async function legacyFileIndex(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const directory of LEGACY_DIRECTORY_ORDER) {
    const folder = path.join(audioRoot, directory);
    try {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (entry.isFile()) files.set(entry.name, path.join(folder, entry.name));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Preserve the spelling alias used by the legacy audioAssets.ts registry.
  const gandepalli = path.join(audioRoot, "ST-VH02", "23gandepally.mp3");
  try { await access(gandepalli); files.set("23gandepalli.mp3", gandepalli); } catch { /* reported below if referenced */ }
  return files;
}

async function buildManifest() {
  const [routes, files] = await Promise.all([legacyRoutes(), legacyFileIndex()]);
  const selectedRoutes = routes.filter((route) => routeCode(route.routeNumber) in ROUTES);
  if (selectedRoutes.length !== Object.keys(ROUTES).length) {
    throw new Error(`Expected ${Object.keys(ROUTES).length} active legacy routes, found ${selectedRoutes.length}`);
  }
  const missing = new Set<string>();
  const routeManifest = selectedRoutes.map((route) => ({
    route,
    metadata: ROUTES[routeCode(route.routeNumber) as keyof typeof ROUTES],
    stops: route.stops.map((stop) => {
      const file = files.get(stop.audioFile);
      if (!file) missing.add(stop.audioFile);
      return { ...stop, file };
    }),
  }));
  const welcomeFolder = path.join(audioRoot, "welcomenotes");
  const welcomeFiles = (await readdir(welcomeFolder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && [".mp3", ".mpeg"].includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(welcomeFolder, entry.name))
    .sort((left, right) => left.localeCompare(right));
  const dinnerFile = path.join(audioRoot, "QA", "DinnerBreak.mp3");
  const toiletFile = path.join(audioRoot, "QA", "WashroomBreak.mp3");
  for (const file of [dinnerFile, toiletFile]) {
    try { await access(file); } catch { missing.add(path.relative(audioRoot, file)); }
  }
  if (missing.size > 0) throw new Error(`Missing legacy audio files: ${[...missing].join(", ")}`);
  return { routeManifest, welcomeFiles, dinnerFile, toiletFile };
}

async function main() {
  const manifest = await buildManifest();
  const referencedFiles = [
    ...manifest.routeManifest.flatMap(({ stops }) => stops.map((stop) => stop.file!)),
    ...manifest.welcomeFiles,
    manifest.dinnerFile,
    manifest.toiletFile,
  ];
  const uniqueFiles = new Set(referencedFiles);
  console.log(`Validated ${manifest.routeManifest.length} routes, ${manifest.welcomeFiles.length} welcome notes and ${uniqueFiles.size} unique audio files.`);
  if (dryRun) return;

  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_PRODUCTION_ANNOUNCEMENT_SEED"] !== "true") {
    throw new Error("Production seeding is blocked. Use a staging/dev environment or explicitly set ALLOW_PRODUCTION_ANNOUNCEMENT_SEED=true.");
  }
  if (process.env["ALLOW_ANNOUNCEMENT_SEED"] !== "true") {
    throw new Error("Set ALLOW_ANNOUNCEMENT_SEED=true to confirm database and R2 writes.");
  }

  const connectionString = process.env["DIRECT_URL"]?.trim() || required("DATABASE_URL");
  const endpoint = required("R2_ENDPOINT");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET_NAME");
  const publicBaseUrl = required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  const adminUsername = required("ANNOUNCEMENT_SEED_ADMIN_USERNAME");
  const client = new S3Client({
    region: "auto", endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const admin = await prisma.user.findUnique({ where: { username: adminUsername }, select: { id: true } });
    if (!admin) throw new Error(`Admin user ${adminUsername} does not exist`);
    const assetByFile = new Map<string, { id: string }>();

    const ensureAsset = async (file: string, category: AudioCategory, title: string) => {
      const cached = assetByFile.get(file);
      if (cached) return cached;
      const [body, details] = await Promise.all([readFile(file), stat(file)]);
      const checksum = createHash("sha256").update(body).digest("hex");
      const safeName = path.basename(file).replace(/[^a-zA-Z0-9._-]+/g, "-");
      const storageKey = `announcements/seed/${checksum.slice(0, 16)}-${safeName}`;
      const contentType = mimeType(file);
      let etag: string | undefined;
      try {
        const existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
        if (existing.ContentLength !== details.size || existing.ContentType !== contentType) {
          throw new Error(`Existing R2 object metadata does not match ${file}`);
        }
        etag = existing.ETag;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
        const uploaded = await client.send(new PutObjectCommand({
          Bucket: bucket, Key: storageKey, Body: body, ContentType: contentType, ContentLength: details.size,
        }));
        etag = uploaded.ETag;
      }
      const url = `${publicBaseUrl}/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
      const asset = await prisma.audioAsset.upsert({
        where: { storageKey },
        update: {
          title, category, originalFileName: path.basename(file), mimeType: contentType,
          sizeBytes: BigInt(details.size), checksumSha256: checksum, blobUrl: url,
          downloadUrl: url, etag, status: AudioAssetStatus.ready,
        },
        create: {
          title, category, originalFileName: path.basename(file), storageKey,
          mimeType: contentType, sizeBytes: BigInt(details.size), checksumSha256: checksum,
          blobUrl: url, downloadUrl: url, etag, status: AudioAssetStatus.ready,
          createdById: admin.id,
        },
        select: { id: true },
      });
      assetByFile.set(file, asset);
      console.log(`Ready: ${path.relative(audioRoot, file)}`);
      return asset;
    };

    for (const file of manifest.welcomeFiles) {
      await ensureAsset(file, AudioCategory.welcome_note, titleFromFile(file));
    }
    const dinner = await ensureAsset(manifest.dinnerFile, AudioCategory.common_audio, "Dinner Break");
    const toilet = await ensureAsset(manifest.toiletFile, AudioCategory.common_audio, "Toilet Break");

    for (const { route, metadata, stops } of manifest.routeManifest) {
      const code = routeCode(route.routeNumber);
      const assets = [];
      for (const stop of stops) {
        assets.push({ stop, asset: await ensureAsset(stop.file!, AudioCategory.stop_announcement, stop.name) });
      }
      await prisma.$transaction(async (tx) => {
        const savedRoute = await tx.announcementRoute.upsert({
          where: { routeCode: code },
          update: { name: route.routeName, ...metadata, status: AnnouncementRouteStatus.published, updatedById: admin.id },
          create: {
            routeCode: code, name: route.routeName, ...metadata,
            status: AnnouncementRouteStatus.published, createdById: admin.id, updatedById: admin.id,
          },
          select: { id: true },
        });
        await tx.routeAudioAssignment.deleteMany({ where: { routeId: savedRoute.id } });
        await tx.routeAudioAssignment.createMany({ data: assets.map(({ stop, asset }, index) => ({
          routeId: savedRoute.id, audioId: asset.id, position: index + 1, stopLabel: stop.name,
        })) });
      });
      console.log(`Published ${code} with ${assets.length} announcements.`);
    }

    await prisma.announcementSettings.upsert({
      where: { id: "default" },
      update: { dinnerBreakAudioId: dinner.id, toiletBreakAudioId: toilet.id, updatedById: admin.id },
      create: {
        id: "default", dinnerBreakAudioId: dinner.id, toiletBreakAudioId: toilet.id,
        recordsDriveUrl: process.env["ANNOUNCEMENT_RECORDS_DRIVE_URL"]?.trim() || null,
        updatedById: admin.id,
      },
    });
    console.log("Announcement seed completed.");
  } finally {
    client.destroy();
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Announcement seed failed", error);
  process.exitCode = 1;
});
