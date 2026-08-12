const multer = require('multer');
const { MAX_IMAGE_SIZE_BYTES } = require('../services/gcsStorage.service');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP.'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 10,
  },
  fileFilter,
});

module.exports = upload;
