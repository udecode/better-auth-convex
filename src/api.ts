import type { BetterAuthOptions } from 'better-auth';

import { getAuthTables } from 'better-auth/db';
import { asyncMap } from 'convex-helpers';
import { partial } from 'convex-helpers/validators';
import {
  type FunctionHandle,
  type SchemaDefinition,
  internalMutationGeneric,
  internalQueryGeneric,
  paginationOptsValidator,
} from 'convex/server';
import { type GenericId, v } from 'convex/values';

import {
  adapterWhereValidator,
  checkUniqueFields,
  hasUniqueFields,
  listOne,
  paginate,
  selectFields,
} from './adapterUtils';

type Schema = SchemaDefinition<any, any>;

const whereValidator = (schema: Schema, tableName: keyof Schema['tables']) =>
  v.object({
    connector: v.optional(v.union(v.literal('AND'), v.literal('OR'))),
    field: v.union(
      ...Object.keys(schema.tables[tableName].validator.fields).map((field) =>
        v.literal(field)
      ),
      v.literal('id')
    ),
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

// Extracted handler functions
export const createHandler = async (
  ctx: any,
  args: {
    input: {
      data: any;
      model: string;
    };
    select?: string[];
    onCreateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    args.input.data
  );
  const id = await ctx.db.insert(args.input.model as any, args.input.data);
  const doc = await ctx.db.get(id);

  if (!doc) {
    throw new Error(`Failed to create ${args.input.model}`);
  }

  const result = selectFields(doc, args.select);

  if (args.onCreateHandle) {
    await ctx.runMutation(args.onCreateHandle as FunctionHandle<'mutation'>, {
      doc,
      model: args.input.model,
    });
  }

  return result;
};

export const findOneHandler = async (
  ctx: any,
  args: {
    model: string;
    select?: string[];
    where?: any[];
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  return await listOne(ctx, schema, betterAuthSchema, args);
};

export const findManyHandler = async (
  ctx: any,
  args: {
    model: string;
    paginationOpts: any;
    limit?: number;
    offset?: number;
    sortBy?: {
      direction: 'asc' | 'desc';
      field: string;
    };
    where?: any[];
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  return await paginate(ctx, schema, betterAuthSchema, args);
};

export const updateOneHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      update: any;
      where?: any[];
    };
    onUpdateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }

  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    args.input.update,
    doc
  );
  await ctx.db.patch(doc._id as GenericId<string>, args.input.update as any);
  const updatedDoc = await ctx.db.get(doc._id as GenericId<string>);

  if (!updatedDoc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }
  if (args.onUpdateHandle) {
    await ctx.runMutation(args.onUpdateHandle as FunctionHandle<'mutation'>, {
      model: args.input.model,
      newDoc: updatedDoc,
      oldDoc: doc,
    });
  }

  return updatedDoc;
};

export const updateManyHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      update?: any;
      where?: any[];
    };
    paginationOpts: any;
    onUpdateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const { page, ...result } = await paginate(ctx, schema, betterAuthSchema, {
    ...args.input,
    paginationOpts: args.paginationOpts,
  });

  if (args.input.update) {
    if (
      hasUniqueFields(
        betterAuthSchema,
        args.input.model,
        args.input.update ?? {}
      ) &&
      page.length > 1
    ) {
      throw new Error(
        `Attempted to set unique fields in multiple documents in ${args.input.model} with the same value. Fields: ${Object.keys(args.input.update ?? {}).join(', ')}`
      );
    }

    await asyncMap(page, async (doc: any) => {
      await checkUniqueFields(
        ctx,
        schema,
        betterAuthSchema,
        args.input.model,
        args.input.update ?? {},
        doc
      );
      await ctx.db.patch(
        doc._id as GenericId<string>,
        args.input.update as any
      );

      if (args.onUpdateHandle) {
        await ctx.runMutation(
          args.onUpdateHandle as FunctionHandle<'mutation'>,
          {
            model: args.input.model,
            newDoc: await ctx.db.get(doc._id as GenericId<string>),
            oldDoc: doc,
          }
        );
      }
    });
  }

  return {
    ...result,
    count: page.length,
    ids: page.map((doc: any) => doc._id),
  };
};

export const deleteOneHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      where?: any[];
    };
    onDeleteHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    return;
  }

  await ctx.db.delete(doc._id as GenericId<string>);

  if (args.onDeleteHandle) {
    await ctx.runMutation(args.onDeleteHandle as FunctionHandle<'mutation'>, {
      doc,
      model: args.input.model,
    });
  }

  return doc;
};

export const deleteManyHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      where?: any[];
    };
    paginationOpts: any;
    onDeleteHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const { page, ...result } = await paginate(ctx, schema, betterAuthSchema, {
    ...args.input,
    paginationOpts: args.paginationOpts,
  });
  await asyncMap(page, async (doc: any) => {
    if (args.onDeleteHandle) {
      await ctx.runMutation(args.onDeleteHandle as FunctionHandle<'mutation'>, {
        doc,
        model: args.input.model,
      });
    }

    await ctx.db.delete(doc._id as GenericId<string>);
  });

  return {
    ...result,
    count: page.length,
    ids: page.map((doc: any) => doc._id),
  };
};

export const createApi = <Schema extends SchemaDefinition<any, any>>(
  schema: Schema,
  authOptions: BetterAuthOptions
) => {
  const betterAuthSchema = getAuthTables(authOptions);

  return {
    create: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(([model, table]) =>
            v.object({
              data: v.object((table as any).validator.fields),
              model: v.literal(model),
            })
          )
        ),
        select: v.optional(v.array(v.string())),
        onCreateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        createHandler(ctx, args, schema, betterAuthSchema),
    }),
    deleteMany: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.keys(schema.tables).map((tableName) => {
            return v.object({
              model: v.literal(tableName),
              where: v.optional(
                v.array(
                  whereValidator(schema, tableName as keyof Schema['tables'])
                )
              ),
            });
          })
        ),
        paginationOpts: paginationOptsValidator,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteManyHandler(ctx, args, schema, betterAuthSchema),
    }),
    deleteOne: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.keys(schema.tables).map((tableName) => {
            return v.object({
              model: v.literal(tableName),
              where: v.optional(
                v.array(
                  whereValidator(schema, tableName as keyof Schema['tables'])
                )
              ),
            });
          })
        ),
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteOneHandler(ctx, args, schema, betterAuthSchema),
    }),
    findMany: internalQueryGeneric({
      args: {
        limit: v.optional(v.number()),
        model: v.union(
          ...Object.keys(schema.tables).map((model) => v.literal(model))
        ),
        offset: v.optional(v.number()),
        paginationOpts: paginationOptsValidator,
        sortBy: v.optional(
          v.object({
            direction: v.union(v.literal('asc'), v.literal('desc')),
            field: v.string(),
          })
        ),
        where: v.optional(v.array(adapterWhereValidator)),
      },
      handler: async (ctx, args) =>
        findManyHandler(ctx, args, schema, betterAuthSchema),
    }),
    findOne: internalQueryGeneric({
      args: {
        model: v.union(
          ...Object.keys(schema.tables).map((model) => v.literal(model))
        ),
        select: v.optional(v.array(v.string())),
        where: v.optional(v.array(adapterWhereValidator)),
      },
      handler: async (ctx, args) =>
        findOneHandler(ctx, args, schema, betterAuthSchema),
    }),
    updateMany: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(
            ([tableName, table]: [string, Schema['tables'][string]]) => {
              const fields = partial(table.validator.fields);

              return v.object({
                model: v.literal(tableName),
                update: v.object(fields),
                where: v.optional(v.array(whereValidator(schema, tableName))),
              });
            }
          )
        ),
        paginationOpts: paginationOptsValidator,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateManyHandler(ctx, args, schema, betterAuthSchema),
    }),
    updateOne: internalMutationGeneric({
      args: {
        input: v.union(
          ...Object.entries(schema.tables).map(
            ([tableName, table]: [string, Schema['tables'][string]]) => {
              const fields = partial(table.validator.fields);

              return v.object({
                model: v.literal(tableName),
                update: v.object(fields),
                where: v.optional(v.array(whereValidator(schema, tableName))),
              });
            }
          )
        ),
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateOneHandler(ctx, args, schema, betterAuthSchema),
    }),
  };
};
