import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from '@aws-sdk/client-s3'

import type { S3ListItem } from './contextFormatters.js'

export type S3Env = {
  region: string
  bucket: string
  prefix: string
  maxObjects: number
}

export function loadS3Env(): S3Env | null {
  const region = process.env.AWS_REGION?.trim()
  const bucket = process.env.S3_BUCKET?.trim()
  if (!region || !bucket) return null
  const prefix = process.env.S3_PREFIX?.trim() ?? ''
  const maxObjects = Math.min(
    20_000,
    Math.max(10, Number(process.env.MAX_S3_OBJECTS) || 1200),
  )
  return { region, bucket, prefix, maxObjects }
}

export async function fetchS3ObjectInventory(
  env: S3Env,
  overrides?: { prefix?: string; maxObjects?: number },
): Promise<{ objects: S3ListItem[]; truncated: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const max = overrides?.maxObjects ?? env.maxObjects
  const prefix = overrides?.prefix !== undefined ? overrides.prefix : env.prefix

  const client = new S3Client({ region: env.region })
  const objects: S3ListItem[] = []
  let token: string | undefined
  let truncated = false

  while (objects.length < max) {
    const pageSize = Math.min(1000, max - objects.length)
    const cmd = new ListObjectsV2Command({
      Bucket: env.bucket,
      Prefix: prefix || undefined,
      MaxKeys: pageSize,
      ContinuationToken: token,
    })
    const out: ListObjectsV2CommandOutput = await client.send(cmd)
    const contents = out.Contents ?? []
    for (const c of contents) {
      if (!c.Key) continue
      objects.push({
        key: c.Key,
        size: c.Size ?? 0,
        lastModified: c.LastModified?.toISOString(),
      })
      if (objects.length >= max) break
    }
    if (out.IsTruncated && out.NextContinuationToken) {
      token = out.NextContinuationToken
      if (objects.length >= max) {
        truncated = true
        break
      }
    } else {
      break
    }
  }

  if (truncated || (token && objects.length >= max)) {
    truncated = true
    warnings.push(
      `S3: listing capped at ${max} objects; bucket may contain more. Increase MAX_S3_OBJECTS or narrow S3_PREFIX.`,
    )
  }
  if (objects.length === 0) {
    warnings.push(
      'S3: no objects under prefix — check bucket, prefix, and IAM ListBucket permission.',
    )
  }
  return { objects, truncated, warnings }
}
