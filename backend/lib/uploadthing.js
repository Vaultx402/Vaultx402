import { createUploadthing } from 'uploadthing/server';

const f = createUploadthing();

const maxFileSize = `${process.env.MAX_FILE_SIZE || 50}MB`;

export const uploadRouter = {
  fileUploader: f({
    'application/pdf': { maxFileSize },
    'image/*': { maxFileSize },
    'video/*': { maxFileSize },
    'text/*': { maxFileSize },
    'application/zip': { maxFileSize },
    'application/json': { maxFileSize },
    'application/octet-stream': { maxFileSize }
  })
    .middleware(async ({ req }) => {
      return { userId: req.headers['x-user-id'] || 'anonymous' };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log('Upload complete for userId:', metadata.userId);
      console.log('File URL:', file.url);

      return {
        uploadedBy: metadata.userId,
        fileUrl: file.url
      };
    })
};

export const utConfig = {
  uploadRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN
  }
};
