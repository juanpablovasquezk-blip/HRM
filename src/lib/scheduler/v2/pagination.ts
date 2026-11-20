export interface PaginatedFetchResult<T> {
  data: T[] | null;
  error: string | null;
  pages_fetched: number;
}

/**
 * Fetches all pages sequentially with stable bounds [from, to].
 * If any page fails, aborts immediately and returns `{ data: null, error }`
 * so partial results are never treated as complete.
 */
export async function fetchAllPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = 1000
): Promise<PaginatedFetchResult<T>> {
  const all: T[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      return {
        data: null,
        error: error.message,
        pages_fetched: page + 1,
      };
    }

    const chunk = data || [];
    all.push(...chunk);
    page++;

    if (chunk.length < pageSize) {
      break;
    }
  }

  return {
    data: all,
    error: null,
    pages_fetched: page,
  };
}
