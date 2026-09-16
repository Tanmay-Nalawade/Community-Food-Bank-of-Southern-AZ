const PAGE_SIZE = 10;

// Fetches one extra item beyond pageSize so callers can tell whether more
// data exists without a separate count query, then slices back down.
// `fetcher` is (skip, limit) => a Mongoose query or aggregate (or any
// thenable resolving to an array).
async function fetchPage(fetcher, skip, pageSize = PAGE_SIZE) {
  const probe = await fetcher(skip, pageSize + 1);
  const hasMore = probe.length > pageSize;
  const items = probe.slice(0, pageSize);
  return { items, hasMore, nextSkip: skip + pageSize };
}

module.exports = { PAGE_SIZE, fetchPage };
