// Minimal ambient type for read-excel-file's browser sub-path.
// v9 returns Sheet[] (`[{ sheet, data }, ...]`); older versions returned
// rows directly. Our parser handles both shapes defensively, so we keep
// this loose as `unknown` and narrow at runtime.
declare module "read-excel-file/browser" {
  const readXlsxFile: (file: File | Blob) => Promise<unknown>;
  export default readXlsxFile;
}
