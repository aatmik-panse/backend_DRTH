import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload only images.'));
        }
    },
});
