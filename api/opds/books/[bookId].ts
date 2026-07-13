import { apiHandler } from "../../_utils/api-handler.js";
import {
  authorizeOpdsRequest,
  sendOpdsAuthFailure,
} from "../_helpers/_auth.js";
import {
  downloadOpdsBook,
  listOpdsBooks,
  normalizeOpdsBookId,
} from "../_helpers/_catalog.js";

function contentDisposition(fileName: string): string {
  const safeName =
    fileName
      .replace(/[\r\n]/g, "")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_") || "book.epub";
  const encodedName = encodeURIComponent(fileName.replace(/[\r\n]/g, ""));
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`;
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
    allowMissingOrigin: true,
    contentType: "application/epub+zip",
  },
  async ({ req, res, redis, logger }): Promise<void> => {
    const auth = await authorizeOpdsRequest(req, redis);
    if (auth.kind !== "authenticated") {
      sendOpdsAuthFailure(res, auth);
      return;
    }

    const bookId = normalizeOpdsBookId(req.query.bookId);
    if (!bookId) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(404).send("Book not found");
      return;
    }

    const books = await listOpdsBooks(redis, auth.username);
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(404).send("Book not found");
      return;
    }

    try {
      const epub = await downloadOpdsBook(auth.username, book);
      logger.info("Serving OPDS book", {
        username: auth.username,
        bookId: book.id,
        byteLength: epub.byteLength,
      });

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", contentDisposition(book.fileName));
      res.setHeader("Content-Length", String(epub.byteLength));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).send(epub);
    } catch (error) {
      logger.error("Failed to serve OPDS book", error);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.status(502).send("Book content is unavailable");
    }
  },
);
