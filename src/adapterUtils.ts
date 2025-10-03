import type { BetterAuthDbSchema } from 'better-auth/db';
import type {
  DocumentByName,
  GenericDataModel,
  GenericQueryCtx,
  PaginationOptions,
  PaginationResult,
  SchemaDefinition,
  TableNamesInDataModel,
} from 'convex/server';

import { stripIndent } from 'common-tags';
import { asyncMap } from 'convex-helpers';
import { stream } from 'convex-helpers/server/stream';
import { mergedStream } from 'convex-helpers/server/stream';
import { type GenericId, type Infer, v } from 'convex/values';

export const adapterWhereValidator = v.object({
  connector: v.optional(v.union(v.literal('AND'), v.literal('OR'))),
  field: v.string(),
  operator: v.optional(
    v.union(
      v.literal('lt'),
      v.literal('lte'),
      v.literal('gt'),
      v.literal('gte'),
      v.literal('eq'),
      v.literal('in'),
      v.literal('not_in'),
      v.literal('ne'),
      v.literal('contains'),
      v.literal('starts_with'),
      v.literal('ends_with')
    )
  ),
  value: v.union(
    v.string(),
    v.number(),
    v.boolean(),
    v.array(v.string()),
    v.array(v.number()),
    v.null()
  ),
});

export const adapterArgsValidator = v.object({
  limit: v.optional(v.number()),
  model: v.string(),
  offset: v.optional(v.number()),
  select: v.optional(v.array(v.string())),
  sortBy: v.optional(
    v.object({
      direction: v.union(v.literal('asc'), v.literal('desc')),
      field: v.string(),
    })
  ),
  where: v.optional(v.array(adapterWhereValidator)),
});

const isUniqueField = (
  betterAuthSchema: BetterAuthDbSchema,
  model: string,
  field: string
) => {
  const fields =
    betterAuthSchema[model as keyof typeof betterAuthSchema].fields;

  if (!fields) {
    return false;
  }

  return Object.entries(fields)
    .filter(([, value]) => value.unique)
    .map(([key]) => key)
    .includes(field);
};

export const hasUniqueFields = (
  betterAuthSchema: BetterAuthDbSchema,
  model: string,
  input: Record<string, any>
) => {
  for (const field of Object.keys(input)) {
    if (isUniqueField(betterAuthSchema, model, field)) {
      return true;
    }
  }

  return false;
};

const findIndex = (
  schema: SchemaDefinition<any, any>,
  args: {
    model: string;
    sortBy?: {
      direction: 'asc' | 'desc';
      field: string;
    };
    where?: {
      field: string;
      value: number[] | string[] | boolean | number | string | null;
      connector?: 'AND' | 'OR';
      operator?:
        | 'contains'
        | 'ends_with'
        | 'eq'
        | 'gt'
        | 'gte'
        | 'in'
        | 'lt'
        | 'lte'
        | 'ne'
        | 'not_in'
        | 'starts_with';
    }[];
  }
) => {
  if (
    (args.where?.length ?? 0) > 1 &&
    args.where?.some((w) => w.connector === 'OR')
  ) {
    throw new Error(
      `OR connector not supported with multiple where statements in findIndex, split up the where statements before calling findIndex: ${JSON.stringify(args.where)}`
    );
  }

  const where = args.where?.filter((w) => {
    return (
      (!w.operator ||
        ['eq', 'gt', 'gte', 'in', 'lt', 'lte', 'not_in'].includes(
          w.operator
        )) &&
      w.field !== 'id'
    );
  });

  if (!where?.length && !args.sortBy) {
    return;
  }

  const lowerBounds =
    where?.filter((w) => w.operator === 'lt' || w.operator === 'lte') ?? [];

  if (lowerBounds.length > 1) {
    throw new Error(
      `cannot have more than one lower bound where clause: ${JSON.stringify(where)}`
    );
  }

  const upperBounds =
    where?.filter((w) => w.operator === 'gt' || w.operator === 'gte') ?? [];

  if (upperBounds.length > 1) {
    throw new Error(
      `cannot have more than one upper bound where clause: ${JSON.stringify(where)}`
    );
  }

  const lowerBound = lowerBounds[0];
  const upperBound = upperBounds[0];

  if (lowerBound && upperBound && lowerBound.field !== upperBound.field) {
    throw new Error(
      `lower bound and upper bound must have the same field: ${JSON.stringify(where)}`
    );
  }

  const boundField = lowerBound?.field || upperBound?.field;

  if (
    boundField &&
    where?.some(
      (w) => w.field === boundField && w !== lowerBound && w !== upperBound
    )
  ) {
    throw new Error(
      `too many where clauses on the bound field: ${JSON.stringify(where)}`
    );
  }

  const indexEqFields =
    where
      ?.filter((w) => !w.operator || w.operator === 'eq')
      .sort((a, b) => {
        return a.field.localeCompare(b.field);
      })
      .map((w) => [w.field, w.value]) ?? [];

  if (!indexEqFields?.length && !boundField && !args.sortBy) {
    return;
  }

  const table = schema.tables[args.model as keyof typeof schema.tables];

  if (!table) {
    throw new Error(`Table ${args.model} not found`);
  }

  // DIFF: convex-ents uses 'indexes' instead of ' indexes'
  const indexes = table[' indexes']
    ? table[' indexes']()
    : (table as any).export().indexes;
  const sortField = args.sortBy?.field;

  // We internally use _creationTime in place of Better Auth's createdAt
  const indexFields = indexEqFields
    .map(([field]) => field)
    .concat(
      boundField && boundField !== 'createdAt'
        ? `${indexEqFields.length > 0 ? '_' : ''}${boundField}`
        : ''
    )
    .concat(
      sortField && sortField !== 'createdAt' && boundField !== sortField
        ? `${indexEqFields.length > 0 || boundField ? '_' : ''}${sortField}`
        : ''
    )
    .filter(Boolean);

  if (indexFields.length === 0 && !boundField && !sortField) {
    return;
  }

  // Use the built in _creationTime index if bounding or sorting by createdAt
  // with no other fields
  const index =
    indexFields.length === 0
      ? {
          fields: [],
          indexDescriptor: 'by_creation_time',
        }
      : indexes.find(({ fields }: { fields: string[] }) => {
          const fieldsMatch = indexFields.every(
            (field, idx) => field === fields[idx]
          );
          // If sorting by createdAt, no intermediate fields can be on the index
          // as they may override the createdAt sort order.
          const boundFieldMatch =
            boundField === 'createdAt' || sortField === 'createdAt'
              ? indexFields.length === fields.length
              : true;

          return fieldsMatch && boundFieldMatch;
        });

  if (!index) {
    return { indexFields };
  }

  return {
    boundField,
    index: {
      fields: [...index.fields, '_creationTime'],
      indexDescriptor: index.indexDescriptor,
    },
    sortField,
    values: {
      eq: indexEqFields.map(([, value]) => value),
      gt: upperBound?.operator === 'gt' ? upperBound.value : undefined,
      gte: upperBound?.operator === 'gte' ? upperBound.value : undefined,
      lt: lowerBound?.operator === 'lt' ? lowerBound.value : undefined,
      lte: lowerBound?.operator === 'lte' ? lowerBound.value : undefined,
    },
  };
};

export const checkUniqueFields = async <
  Schema extends SchemaDefinition<any, any>,
>(
  ctx: GenericQueryCtx<GenericDataModel>,
  schema: Schema,
  betterAuthSchema: BetterAuthDbSchema,
  table: string,
  input: Record<string, any>,
  doc?: Record<string, any>
) => {
  if (!hasUniqueFields(betterAuthSchema, table, input)) {
    return;
  }

  for (const field of Object.keys(input)) {
    if (!isUniqueField(betterAuthSchema, table, field)) {
      continue;
    }

    const { index } =
      findIndex(schema, {
        model: table,
        where: [
          { field, operator: 'eq', value: input[field as keyof typeof input] },
        ],
      }) || {};

    if (!index) {
      throw new Error(`No index found for ${table}${field}`);
    }

    const existingDoc = await ctx.db
      .query(table as any)
      .withIndex(index.indexDescriptor, (q) =>
        q.eq(field, input[field as keyof typeof input])
      )
      .unique();

    if (existingDoc && existingDoc._id !== doc?._id) {
      throw new Error(`${table} ${field} already exists`);
    }
  }
};

// This handles basic select (stripping out the other fields if there
// is a select arg).
export const selectFields = async <
  T extends TableNamesInDataModel<GenericDataModel>,
  D extends DocumentByName<GenericDataModel, T>,
>(
  doc: D | null,
  select?: string[]
) => {
  if (!doc) {
    return null;
  }
  if (!select?.length) {
    return doc;
  }

  return select.reduce((acc, field) => {
    (acc as any)[field] = doc[field];

    return acc;
  }, {} as D);
};

// Manually filter an individual document by where clauses. This is used to
// simplify queries that can only return 0 or 1 documents, or "in" clauses that
// query multiple single documents in parallel.
const filterByWhere = <
  T extends TableNamesInDataModel<GenericDataModel>,
  D extends DocumentByName<GenericDataModel, T>,
>(
  doc: D | null,
  where?: Infer<typeof adapterWhereValidator>[],
  // Optionally filter which where clauses to apply.
  filterWhere?: (w: Infer<typeof adapterWhereValidator>) => any
) => {
  if (!doc) {
    return false;
  }

  for (const w of where ?? []) {
    if (filterWhere && !filterWhere(w)) {
      continue;
    }

    const value = doc[w.field as keyof typeof doc] as Infer<
      typeof adapterWhereValidator
    >['value'];
    const isLessThan = (val: typeof value, wVal: typeof w.value) => {
      if (!wVal) {
        return false;
      }
      if (!val) {
        return true;
      }

      return val < wVal;
    };
    const isGreaterThan = (val: typeof value, wVal: typeof w.value) => {
      if (!val) {
        return false;
      }
      if (!wVal) {
        return true;
      }

      return val > wVal;
    };
    const filter = (w: Infer<typeof adapterWhereValidator>) => {
      switch (w.operator) {
        case 'contains': {
          return typeof value === 'string' && value.includes(w.value as string);
        }
        case 'ends_with': {
          return typeof value === 'string' && value.endsWith(w.value as string);
        }
        case 'eq':
        case undefined: {
          return value === w.value;
        }
        case 'gt': {
          return isGreaterThan(value, w.value);
        }
        case 'gte': {
          return value === w.value || isGreaterThan(value, w.value);
        }
        case 'in': {
          return Array.isArray(w.value) && (w.value as any[]).includes(value);
        }
        case 'lt': {
          return isLessThan(value, w.value);
        }
        case 'lte': {
          return value === w.value || isLessThan(value, w.value);
        }
        case 'ne': {
          return value !== w.value;
        }
        case 'not_in': {
          return Array.isArray(w.value) && !(w.value as any[]).includes(value);
        }
        case 'starts_with': {
          return (
            typeof value === 'string' && value.startsWith(w.value as string)
          );
        }
      }
    };

    if (!filter(w)) {
      return false;
    }
  }

  return true;
};

const generateQuery = (
  ctx: GenericQueryCtx<GenericDataModel>,
  schema: SchemaDefinition<any, any>,
  args: Infer<typeof adapterArgsValidator>
) => {
  const { boundField, index, indexFields, values } =
    findIndex(schema, args) ?? {};
  const query = stream(ctx.db as any, schema).query(args.model as any);
  const hasValues =
    values?.eq?.length ||
    values?.lt ||
    values?.lte ||
    values?.gt ||
    values?.gte;
  const indexedQuery =
    index && index.indexDescriptor !== 'by_creation_time'
      ? query.withIndex(
          index.indexDescriptor,
          hasValues
            ? (q: any) => {
                for (const [idx, value] of (values?.eq ?? []).entries()) {
                  q = q.eq(index.fields[idx], value);
                }

                if (values?.lt) {
                  q = q.lt(boundField, values.lt);
                }
                if (values?.lte) {
                  q = q.lte(boundField, values.lte);
                }
                if (values?.gt) {
                  q = q.gt(boundField, values.gt);
                }
                if (values?.gte) {
                  q = q.gte(boundField, values.gte);
                }

                return q;
              }
            : undefined
        )
      : query;
  const orderedQuery = args.sortBy
    ? indexedQuery.order(args.sortBy.direction === 'desc' ? 'desc' : 'asc')
    : indexedQuery;
  const filteredQuery = orderedQuery.filterWith(async (doc) => {
    if (!index && indexFields?.length) {
      console.warn(
        stripIndent`
          Querying without an index on table "${args.model}".
          This can cause performance issues, and may hit the document read limit.
          To fix, add an index that begins with the following fields in order:
          [${indexFields.join(', ')}]
        `
      );

      // No index, handle all where clauses statically.
      return filterByWhere(doc, args.where);
    }

    return filterByWhere(
      doc,
      args.where,
      // Index used for all eq and range clauses, apply remaining clauses
      // incompatible with Convex statically.
      (w) =>
        w.operator &&
        ['contains', 'ends_with', 'ne', 'not_in', 'starts_with'].includes(
          w.operator
        )
    );
  });

  return filteredQuery;
};

// This is the core function for reading from the database, it parses and
// validates where conditions, selects indexes, and allows the caller to
// optionally paginate as needed. Every response is a pagination result.
export const paginate = async <
  Doc extends DocumentByName<GenericDataModel, T>,
  T extends TableNamesInDataModel<GenericDataModel>,
>(
  ctx: GenericQueryCtx<GenericDataModel>,
  schema: SchemaDefinition<any, any>,
  betterAuthSchema: BetterAuthDbSchema,
  args: Infer<typeof adapterArgsValidator> & {
    paginationOpts: PaginationOptions;
  }
): Promise<PaginationResult<Doc>> => {
  if (args.offset) {
    throw new Error(`offset not supported: ${JSON.stringify(args.offset)}`);
  }
  if (args.where?.some((w) => w.connector === 'OR') && args.where?.length > 1) {
    throw new Error(
      `OR connector not supported with multiple where statements in paginate, split up the where statements before calling paginate: ${JSON.stringify(args.where)}`
    );
  }
  if (
    args.where?.some(
      (w) =>
        w.field === 'id' &&
        w.operator &&
        !['eq', 'in', 'ne', 'not_in'].includes(w.operator)
    )
  ) {
    throw new Error(
      `id can only be used with eq, in, not_in, or ne operator: ${JSON.stringify(args.where)}`
    );
  }

  // If any where clause is "eq" (or missing operator) on a unique field,
  // we can only return a single document, so we get it and use any other
  // where clauses as static filters.
  const uniqueWhere = args.where?.find(
    (w) =>
      (!w.operator || w.operator === 'eq') &&
      (isUniqueField(betterAuthSchema, args.model, w.field) || w.field === 'id')
  );

  if (uniqueWhere) {
    const { index } =
      findIndex(schema, {
        model: args.model,
        where: [uniqueWhere],
      }) || {};
    const doc =
      uniqueWhere.field === 'id'
        ? await ctx.db.get(uniqueWhere.value as GenericId<T>)
        : await ctx.db
            .query(args.model as any)
            .withIndex(index?.indexDescriptor as any, (q) =>
              q.eq(index?.fields[0], uniqueWhere.value)
            )
            .unique();

    // Apply all other clauses as static filters to our 0 or 1 result.
    if (filterByWhere(doc, args.where, (w) => w !== uniqueWhere)) {
      return {
        continueCursor: '',
        isDone: true,
        page: [await selectFields(doc, args.select)].filter(Boolean) as Doc[],
      };
    }

    return {
      continueCursor: '',
      isDone: true,
      page: [],
    };
  }

  const paginationOpts = {
    ...args.paginationOpts,
    // If maximumRowsRead is not at least 1 higher than numItems, bad cursors
    // and incorrect paging will result (at least with convex-test).
    maximumRowsRead: Math.max((args.paginationOpts.numItems ?? 0) + 1, 200),
  };

  // Large queries using "in" clause will crash, but these are only currently
  // possible with the organization plugin listing all members with a high
  // limit. For cases like this we need to create proper convex queries in
  // the component as an alternative to using Better Auth api's.
  const inWhere = args.where?.find((w) => w.operator === 'in');

  if (inWhere) {
    if (!Array.isArray(inWhere.value)) {
      throw new TypeError('in clause value must be an array');
    }
    // For ids, just use asyncMap + .get()
    if (inWhere.field === 'id') {
      const docs = await asyncMap(inWhere.value as any[], async (value) => {
        return ctx.db.get(value as GenericId<T>);
      });
      const filteredDocs = docs
        .flatMap((doc) => (doc ? [doc] : []))
        .filter((doc) => filterByWhere(doc, args.where, (w) => w !== inWhere));

      return {
        continueCursor: '',
        isDone: true,
        page: filteredDocs.sort((a, b) => {
          if (args.sortBy?.field === 'createdAt') {
            return args.sortBy.direction === 'asc'
              ? (a._creationTime as number) - (b._creationTime as number)
              : (b._creationTime as number) - (a._creationTime as number);
          }
          if (args.sortBy) {
            const aValue = a[args.sortBy.field as keyof typeof a];
            const bValue = b[args.sortBy.field as keyof typeof b];

            if (aValue === bValue) {
              return 0;
            }

            return args.sortBy.direction === 'asc'
              ? aValue! > bValue!
                ? 1
                : -1
              : aValue! > bValue!
                ? -1
                : 1;
          }

          return 0;
        }) as Doc[],
      };
    }

    const streams = inWhere.value.map((value) => {
      return generateQuery(ctx, schema, {
        ...args,
        where: args.where?.map((w) => {
          if (w === inWhere) {
            return { ...w, operator: 'eq', value };
          }

          return w;
        }),
      });
    });
    const result = await mergedStream(
      streams,
      [
        args.sortBy?.field !== 'createdAt' && args.sortBy?.field,
        '_creationTime',
      ].flatMap((f) => (f ? [f] : []))
    ).paginate(paginationOpts);

    return {
      ...result,
      page: await asyncMap(result.page, (doc) =>
        selectFields(doc, args.select)
      ),
    };
  }

  // Handle not_in operator separately as it requires filtering out documents
  const notInWhere = args.where?.find((w) => w.operator === 'not_in');

  if (notInWhere) {
    if (!Array.isArray(notInWhere.value)) {
      throw new TypeError('not_in clause value must be an array');
    }

    // For not_in with IDs, we need to query all and filter out the excluded ones
    const query = generateQuery(ctx, schema, {
      ...args,
      where: args.where?.filter((w) => w !== notInWhere),
    });
    const result = await query.paginate(paginationOpts);
    const filteredPage = result.page.filter((doc) =>
      filterByWhere(doc, [notInWhere])
    );

    return {
      ...result,
      page: await asyncMap(filteredPage, (doc) =>
        selectFields(doc, args.select)
      ),
    };
  }

  const query = generateQuery(ctx, schema, args);
  const result = await query.paginate(paginationOpts);

  return {
    ...result,
    page: await asyncMap(result.page, (doc) => selectFields(doc, args.select)),
  };
};

export const listOne = async <
  Doc extends DocumentByName<GenericDataModel, T>,
  T extends TableNamesInDataModel<GenericDataModel>,
>(
  ctx: GenericQueryCtx<GenericDataModel>,
  schema: SchemaDefinition<any, any>,
  betterAuthSchema: BetterAuthDbSchema,
  args: Infer<typeof adapterArgsValidator>
): Promise<Doc | null> => {
  return (
    await paginate(ctx, schema, betterAuthSchema, {
      ...args,
      paginationOpts: {
        cursor: null,
        numItems: 1,
      },
    })
  ).page[0] as Doc | null;
};
