// Vite's "?raw" suffix imports a file's contents as a string (used for SQL migrations).
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
