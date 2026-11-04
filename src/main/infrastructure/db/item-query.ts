import {
  DummyDriver,
  Kysely,
  sql,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
} from 'kysely';
import type { ItemRole } from '../../../core/catalogs/catalogs';
import { filterFieldFor, type ItemFlagColumn } from '../../../core/filters/filter-fields';
import type { FilterCondition, FilterNode } from '../../../core/filters/filter-tree';
import { DEFAULT_ITEM_SORT, type ItemSort } from '../../../core/filters/item-sort';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { ItemKind } from '../../../shared/content';

/** The tables and columns the library query reads. */
interface LibrarySchema {
  item: {
    id: number;
    kind: string;
    title: string | null;
    title_norm: string | null;
    placeholder_no: number | null;
    is_favorite: number;
    is_replay: number;
    owns_physical: number;
    owns_digital: number;
    rating: number | null;
    status: string | null;
    started_on: string | null;
    finished_on: string | null;
    created_at: string;
    deleted_at: string | null;
    cover_media_id: number | null;
  };
  item_entry: { item_id: number; entry_id: number; role: ItemRole };
  item_alt_title: { item_id: number; title_norm: string };
  item_release: { item_id: number; date: string };
  media_file: { id: number; sha256: string; width: number | null; height: number | null };
}

type ItemExpressions = ExpressionBuilder<LibrarySchema, 'item'>;

export interface ItemSearch {
  readonly text: string;
  /** "Untitled" in the UI language, which only the UI knows. Items without a title match it. */
  readonly untitledLabel: string;
}

export interface ItemListOptions {
  readonly search?: ItemSearch | undefined;
  /** Must have passed validateFilter for the same kind. */
  readonly filter?: FilterNode | null | undefined;
  readonly sort?: ItemSort | undefined;
}

// Kysely only writes the SQL here: better-sqlite3 runs it, because Kysely's own execution is
// asynchronous and the services are synchronous. That is why the driver does nothing.
const builder = new Kysely<LibrarySchema>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

/** Escapes what LIKE treats as wildcards, so "100%" means exactly that. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

const flagEquals = (eb: ItemExpressions, column: ItemFlagColumn, value: boolean) =>
  eb(`item.${column}`, '=', value ? 1 : 0);

function conditionExpression(
  eb: ItemExpressions,
  kind: ItemKind,
  condition: FilterCondition,
): Expression<SqlBool> {
  const { operator, value } = condition;
  const source = filterFieldFor(kind, condition.field)?.source;
  if (source === undefined) throw new Error(`Filter field not validated: ${condition.field}`);

  switch (source.type) {
    case 'role': {
      // EXISTS per condition: "genre is RPG AND genre is Action" means the item has both.
      const related = eb.exists(
        eb
          .selectFrom('item_entry')
          .select('item_entry.item_id')
          .whereRef('item_entry.item_id', '=', 'item.id')
          .where('item_entry.role', '=', source.role)
          .where('item_entry.entry_id', '=', value as number),
      );
      return operator === 'is' ? related : eb.not(related);
    }
    case 'choice': {
      const column = `item.${source.column}` as const;
      // An item without a value "is not" any of them, but != alone would leave it out.
      return operator === 'is'
        ? eb(column, '=', value as string)
        : eb.or([eb(column, '!=', value as string), eb(column, 'is', null)]);
    }
    case 'flag':
      return flagEquals(eb, source.column, value as boolean);
    case 'flags':
      return flagEquals(eb, source.columns[value as string]!, operator === 'is');
    case 'rating':
      if (operator === 'isEmpty') return eb('item.rating', 'is', null);
      return eb('item.rating', operator === 'gte' ? '>=' : '<=', value as number);
  }
}

function filterExpression(
  eb: ItemExpressions,
  kind: ItemKind,
  node: FilterNode,
): Expression<SqlBool> {
  if (node.type === 'condition') return conditionExpression(eb, kind, node);
  const children = node.children.map((child) => filterExpression(eb, kind, child));
  return node.op === 'and' ? eb.and(children) : eb.or(children);
}

function searchExpression(eb: ItemExpressions, text: string, label: string): Expression<SqlBool> {
  const pattern = likePattern(text);
  const shownAs = `${normalizeForSearch(label)} `;
  return eb.or([
    sql<SqlBool>`item.title_norm LIKE ${pattern} ESCAPE '\\'`,
    eb.exists(
      eb
        .selectFrom('item_alt_title')
        .select('item_alt_title.item_id')
        .whereRef('item_alt_title.item_id', '=', 'item.id')
        .where(sql<SqlBool>`item_alt_title.title_norm LIKE ${pattern} ESCAPE '\\'`),
    ),
    // Only items without a title have a number, so the rest never match here.
    sql<SqlBool>`(${shownAs} || item.placeholder_no) LIKE ${pattern} ESCAPE '\\'`,
  ]);
}

/**
 * The library's items of one kind, without those in the trash. Whatever the direction, items
 * with nothing to sort by go last: untitled, not rated, without a date or with an unknown one.
 * Items that tie follow the title order, so the result is always the same.
 */
export function buildItemListQuery(kind: ItemKind, options: ItemListOptions): CompiledQuery {
  const { search, filter, sort = DEFAULT_ITEM_SORT } = options;
  const text = search ? normalizeForSearch(search.text) : '';
  const { direction } = sort;

  const sorted = builder
    .selectFrom('item')
    .leftJoin('media_file as cover', 'cover.id', 'item.cover_media_id')
    .select([
      'item.id',
      'item.kind',
      'item.title',
      'item.placeholder_no',
      'item.is_favorite',
      'item.rating',
      'item.status',
      'item.deleted_at',
      'cover.sha256 as cover_sha256',
      'cover.width as cover_width',
      'cover.height as cover_height',
    ])
    .where('item.kind', '=', kind)
    .where('item.deleted_at', 'is', null)
    .$if(text.length > 0, (query) =>
      query.where((eb) => searchExpression(eb, text, search!.untitledLabel)),
    )
    .$if(filter != null, (query) => query.where((eb) => filterExpression(eb, kind, filter!)))
    .orderBy(sortExpression(sort), (order) =>
      direction === 'asc' ? order.asc().nullsLast() : order.desc().nullsLast(),
    );

  // Sorting by title already starts with the title; only its tie-breakers are left.
  const withTitle =
    sort.field === 'title'
      ? sorted
      : sorted.orderBy('item.title_norm', (order) => order.asc().nullsLast());
  return withTitle.orderBy('item.placeholder_no').orderBy('item.id').compile();
}

function sortExpression(sort: ItemSort): Expression<unknown> {
  switch (sort.field) {
    case 'title':
      return sql.ref('item.title_norm');
    case 'createdAt':
      return sql.ref('item.created_at');
    case 'rating':
      return sql.ref('item.rating');
    case 'releaseDate':
      return sql`(SELECT MIN(item_release.date) FROM item_release WHERE item_release.item_id = item.id)`;
    case 'startedOn':
      return sql`NULLIF(item.started_on, 'unknown')`;
    case 'finishedOn':
      return sql`NULLIF(item.finished_on, 'unknown')`;
  }
}
