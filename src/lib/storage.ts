import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.S3_REGION ?? "us-east-1";
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

if (!bucket) throw new Error("S3_BUCKET is required");
if (!accessKeyId) throw new Error("S3_ACCESS_KEY is required");
if (!secretAccessKey) throw new Error("S3_SECRET_KEY is required");

export const s3 = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});

export const S3_BUCKET = bucket;

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string | undefined,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function presignedGetUrl(
  key: string,
  ttlSec = 3600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttlSec },
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObjectBuffer(key: string): Promise<Uint8Array> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!res.Body) throw new Error(`S3 object has no body: ${key}`);
  return res.Body.transformToByteArray();
}
