import { apiHandler } from "../_utils/api-handler.js";
import {
  authorizeOpdsRequest,
  sendOpdsAuthFailure,
} from "./_helpers/_auth.js";
import {
  listOpdsBooks,
  OPDS_FEED_CONTENT_TYPE,
  renderOpdsFeed,
} from "./_helpers/_catalog.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
    allowMissingOrigin: true,
    contentType: OPDS_FEED_CONTENT_TYPE,
  },
  async ({ req, res, redis, logger }): Promise<void> => {
    const auth = await authorizeOpdsRequest(req, redis);
    if (auth.kind !== "authenticated") {
      sendOpdsAuthFailure(res, auth);
      return;
    }

    const books = await listOpdsBooks(redis, auth.username);
    logger.info("Serving OPDS Books catalog", {
      username: auth.username,
      bookCount: books.length,
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(renderOpdsFeed(auth.username, books));
  },
);
