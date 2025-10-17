import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Request, Response, Router } from "express";
import config from "../config/app.config";

const s3Client = new S3Client({
  region: config.AWS.REGION,
  credentials: {
    accessKeyId: config.AWS.ACCESS_KEY_ID,
    secretAccessKey: config.AWS.SECRET_ACCESS_KEY,
  },
});

const router = Router();

export const generatePresignedUrl = async (req: Request, res: Response) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const { key, contentType } = req.body;

    if (!key || !contentType) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    const command = new PutObjectCommand({
      Bucket: config.AWS.BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return res.status(200).json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return res.status(500).json({ message: "Error generating upload URL" });
  }
};

router.post("/s3", generatePresignedUrl);

export { router as UploadRoutes };
