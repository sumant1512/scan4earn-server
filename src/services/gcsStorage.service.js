const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const path = require('path');

const MAX_IMAGE_SIZE_BYTES = 200 * 1024;

function resolveGoogleCredentialsPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  const candidatePaths = [
    path.resolve(__dirname, '../../image-upload-service-account.json'),
    path.resolve(process.cwd(), 'image-upload-service-account.json'),
    path.resolve(__dirname, '../..', 'image-upload-service-account.json'),
  ];

  return candidatePaths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || null;
}

function getStorageClient() {
  const projectId = process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
  const credentialPath = resolveGoogleCredentialsPath();
  const storageOptions = {};

  let resolvedProjectId = projectId;
  if (!resolvedProjectId && credentialPath) {
    try {
      const credentialJson = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
      resolvedProjectId = credentialJson.project_id || null;
    } catch (error) {
      // Ignore parse errors and let the storage client fall back to ADC or environment config.
    }
  }

  if (resolvedProjectId) {
    storageOptions.projectId = resolvedProjectId;
  }

  if (credentialPath) {
    storageOptions.keyFilename = credentialPath;
  }

  if (!resolvedProjectId && !credentialPath && !process.env.GCS_BUCKET_NAME) {
    throw new Error('GCS storage is not configured. Set GCS_BUCKET_NAME and Google credentials.');
  }

  return new Storage(storageOptions);
}

function buildSafeDestination(prefix, originalName) {
  const ext = path.extname(originalName || 'image.jpg').toLowerCase() || '.jpg';
  const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  return `${prefix.replace(/^\/+|\/+$/g, '')}/${uniqueName}`.replace(/\\/g, '/');
}

async function uploadBufferToGcs(buffer, options = {}) {
  const {
    destination,
    bucketName = process.env.GCS_BUCKET_NAME,
    contentType = 'application/octet-stream',
    makePublic = true,
  } = options;

  if (!bucketName) {
    throw new Error('GCS_BUCKET_NAME is not configured.');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('No file content was provided for upload.');
  }

  const storage = getStorageClient();
  const bucket = storage.bucket(bucketName);
  const filePath = destination.replace(/^\/+/, '');
  const file = bucket.file(filePath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  if (makePublic) {
    try {
      await file.makePublic();
    } catch (error) {
      console.warn('GCS makePublic failed, falling back to signed URL.', error.message);
    }
  }

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;

  try {
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return {
      url: signedUrl || publicUrl,
      publicUrl,
      bucketName,
      path: filePath,
    };
  } catch (error) {
    return {
      url: publicUrl,
      publicUrl,
      bucketName,
      path: filePath,
    };
  }
}

module.exports = {
  MAX_IMAGE_SIZE_BYTES,
  buildSafeDestination,
  uploadBufferToGcs,
};
