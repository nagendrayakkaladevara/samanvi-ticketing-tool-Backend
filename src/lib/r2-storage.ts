import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { badRequest } from "../core/errors/http-errors";

export const R2_UPLOAD_EXPIRES_SECONDS = 300;

function storage() {
  if (!env.r2Endpoint || !env.r2AccessKeyId || !env.r2SecretAccessKey ||
      !env.r2BucketName || !env.r2PublicBaseUrl) {
    throw new Error("R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_BASE_URL are required for audio uploads");
  }
  return {
    client: new S3Client({
      region: "auto",
      endpoint: env.r2Endpoint,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    bucket: env.r2BucketName,
    publicBaseUrl: env.r2PublicBaseUrl.replace(/\/+$/, ""),
  };
}

export async function createAudioUploadUrl(key: string, mimeType: string, sizeBytes: number) {
  const { client, bucket } = storage();
  try {
    return await getSignedUrl(client, new PutObjectCommand({
      Bucket: bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes,
      IfNoneMatch: "*",
    }), {
      expiresIn: R2_UPLOAD_EXPIRES_SECONDS,
      signableHeaders: new Set(["content-type", "content-length", "if-none-match"]),
    });
  } finally {
    client.destroy();
  }
}

export async function inspectAudioUpload(key: string) {
  const { client, bucket, publicBaseUrl } = storage();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { object, url: `${publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}` };
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      throw badRequest("Audio file has not been uploaded to R2");
    }
    throw error;
  } finally {
    client.destroy();
  }
}

export async function deleteAudioObject(key: string) {
  const { client, bucket } = storage();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } finally {
    client.destroy();
  }
}
