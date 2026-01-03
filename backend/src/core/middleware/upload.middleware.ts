import path from 'path';
import multer from 'multer';

/**
 * Multer Storage Configuration
 * Handles file uploads with Docker volume support
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use /app/uploads in Docker, ./uploads locally
    const uploadPath = process.env.NODE_ENV === 'production' 
      ? '/app/uploads' 
      : path.join(process.cwd(), 'uploads');
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`); // Generate unique file name
  },
});

/**
 * File Filter
 * Accept or reject files based on type
 */
const fileFilter = (req: any, file: any, cb: any) => {
  // Accept all file types by default
  // You can add validation here:
  // const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  // if (allowedTypes.includes(file.mimetype)) {
  //   cb(null, true);
  // } else {
  //   cb(new Error('Invalid file type'), false);
  // }
  cb(null, true);
};

/**
 * Multer Upload Configuration
 * Configured for Docker volume mounts
 */
const upload = multer({
  dest: process.env.NODE_ENV === 'production' ? '/app/uploads' : './uploads',
  limits: {
    fileSize: 1024 * 1024 * 100, // 100MB
  },
  storage: storage,
  fileFilter: fileFilter,
});

export default upload;

// Export specific upload configurations
export const uploadSingle = (fieldName: string) => upload.single(fieldName);
export const uploadMultiple = (fieldName: string, maxCount?: number) => 
  upload.array(fieldName, maxCount);
export const uploadFields = (fields: multer.Field[]) => upload.fields(fields);

