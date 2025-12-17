import type { BetterAuthOptions } from 'better-auth';

import { getAuthTables } from 'better-auth/db';
import {
  type FunctionHandle,
  internalMutationGeneric,
  internalQueryGeneric,
  paginationOptsValidator,
  type SchemaDefinition,
} from 'convex/server';
import { type GenericId, v } from 'convex/values';
import { asyncMap } from 'convex-helpers';
import { partial } from 'convex-helpers/validators';

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
      v.literal('_id')
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
    beforeCreateHandle?: string;
    select?: string[];
    skipBeforeHooks?: boolean;
    onCreateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  let data = args.input.data;

  if (!args.skipBeforeHooks && args.beforeCreateHandle) {
    const transformedData = await ctx.runMutation(
      args.beforeCreateHandle as FunctionHandle<'mutation'>,
      {
        data,
        model: args.input.model,
      }
    );

    if (transformedData !== undefined) {
      data = transformedData;
    }
  }

  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    data
  );
  const id = await ctx.db.insert(args.input.model as any, data);
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
) => await listOne(ctx, schema, betterAuthSchema, args);

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
) => await paginate(ctx, schema, betterAuthSchema, args);

export const updateOneHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      update: any;
      where?: any[];
    };
    beforeUpdateHandle?: string;
    onUpdateHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    throw new Error(`Failed to update ${args.input.model}`);
  }

  let update = args.input.update;

  if (args.beforeUpdateHandle) {
    const transformedUpdate = await ctx.runMutation(
      args.beforeUpdateHandle as FunctionHandle<'mutation'>,
      {
        doc,
        model: args.input.model,
        update,
      }
    );

    if (transformedUpdate !== undefined) {
      update = transformedUpdate;
    }
  }

  await checkUniqueFields(
    ctx,
    schema,
    betterAuthSchema,
    args.input.model,
    update,
    doc
  );
  await ctx.db.patch(doc._id as GenericId<string>, update as any);
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
    beforeUpdateHandle?: string;
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
      let update = args.input.update;

      if (args.beforeUpdateHandle) {
        const transformedUpdate = await ctx.runMutation(
          args.beforeUpdateHandle as FunctionHandle<'mutation'>,
          {
            doc,
            model: args.input.model,
            update,
          }
        );

        if (transformedUpdate !== undefined) {
          update = transformedUpdate;
        }
      }

      await checkUniqueFields(
        ctx,
        schema,
        betterAuthSchema,
        args.input.model,
        update ?? {},
        doc
      );
      await ctx.db.patch(doc._id as GenericId<string>, update as any);

      if (args.onUpdateHandle) {
        const newDoc = await ctx.db.get(doc._id as GenericId<string>);
        await ctx.runMutation(
          args.onUpdateHandle as FunctionHandle<'mutation'>,
          {
            model: args.input.model,
            newDoc,
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
    beforeDeleteHandle?: string;
    skipBeforeHooks?: boolean;
    onDeleteHandle?: string;
  },
  schema: Schema,
  betterAuthSchema: any
) => {
  const doc = await listOne(ctx, schema, betterAuthSchema, args.input);

  if (!doc) {
    return;
  }

  let hookDoc = doc;

  if (!args.skipBeforeHooks && args.beforeDeleteHandle) {
    const transformedDoc = await ctx.runMutation(
      args.beforeDeleteHandle as FunctionHandle<'mutation'>,
      {
        doc,
        model: args.input.model,
      }
    );

    if (transformedDoc !== undefined) {
      hookDoc = transformedDoc;
    }
  }

  await ctx.db.delete(doc._id as GenericId<string>);

  if (args.onDeleteHandle) {
    await ctx.runMutation(args.onDeleteHandle as FunctionHandle<'mutation'>, {
      doc: hookDoc,
      model: args.input.model,
    });
  }

  return hookDoc;
};

export const deleteManyHandler = async (
  ctx: any,
  args: {
    input: {
      model: string;
      where?: any[];
    };
    paginationOpts: any;
    beforeDeleteHandle?: string;
    skipBeforeHooks?: boolean;
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
    let hookDoc = doc;

    if (!args.skipBeforeHooks && args.beforeDeleteHandle) {
      const transformedDoc = await ctx.runMutation(
        args.beforeDeleteHandle as FunctionHandle<'mutation'>,
        {
          doc,
          model: args.input.model,
        }
      );

      if (transformedDoc !== undefined) {
        hookDoc = transformedDoc;
      }
    }

    await ctx.db.delete(doc._id as GenericId<string>);

    if (args.onDeleteHandle) {
      await ctx.runMutation(args.onDeleteHandle as FunctionHandle<'mutation'>, {
        doc: hookDoc,
        model: args.input.model,
      });
    }
  });

  return {
    ...result,
    count: page.length,
    ids: page.map((doc: any) => doc._id),
  };
};

export const createApi = <Schema extends SchemaDefinition<any, any>>(
  schema: Schema,
  {
    internalMutation,
    skipValidation,
    ...authOptions
  }: BetterAuthOptions & {
    internalMutation?: typeof internalMutationGeneric;
    /** Skip input validation for smaller generated types. Since these are internal functions, validation is optional. */
    skipValidation?: boolean;
  }
) => {
  const betterAuthSchema = getAuthTables(authOptions);
  const mutationBuilder = internalMutation ?? internalMutationGeneric;

  // Generic validators for skipValidation mode (much smaller generated types)
  const anyInput = v.object({
    data: v.any(),
    model: v.string(),
  });
  const anyInputWithWhere = v.object({
    model: v.string(),
    where: v.optional(v.array(v.any())),
  });
  const anyInputWithUpdate = v.object({
    model: v.string(),
    update: v.any(),
    where: v.optional(v.array(v.any())),
  });

  // Typed validators (only auth tables)
  const authTableNames = new Set(Object.keys(betterAuthSchema));
  const authTables = Object.entries(schema.tables).filter(([name]) =>
    authTableNames.has(name)
  );
  const authTableKeys = authTables.map(([name]) => name);

  const createInput = skipValidation
    ? anyInput
    : v.union(
        ...authTables.map(([model, table]) => {
          const fields = partial((table as any).validator.fields);
          return v.object({
            data: v.object(fields),
            model: v.literal(model),
          });
        })
      );

  const deleteInput = skipValidation
    ? anyInputWithWhere
    : v.union(
        ...authTableKeys.map((tableName) =>
          v.object({
            model: v.literal(tableName),
            where: v.optional(
              v.array(
                whereValidator(schema, tableName as keyof Schema['tables'])
              )
            ),
          })
        )
      );

  const modelValidator = skipValidation
    ? v.string()
    : v.union(...authTableKeys.map((model) => v.literal(model)));

  const updateInput = skipValidation
    ? anyInputWithUpdate
    : v.union(
        ...authTables.map(
          ([tableName, table]: [string, Schema['tables'][string]]) => {
            const fields = partial(table.validator.fields);
            return v.object({
              model: v.literal(tableName),
              update: v.object(fields),
              where: v.optional(v.array(whereValidator(schema, tableName))),
            });
          }
        )
      );

  return {
    create: mutationBuilder({
      args: {
        beforeCreateHandle: v.optional(v.string()),
        input: createInput,
        select: v.optional(v.array(v.string())),
        onCreateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        createHandler(ctx, args, schema, betterAuthSchema),
    }),
    deleteMany: mutationBuilder({
      args: {
        beforeDeleteHandle: v.optional(v.string()),
        input: deleteInput,
        paginationOpts: paginationOptsValidator,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteManyHandler(ctx, args, schema, betterAuthSchema),
    }),
    deleteOne: mutationBuilder({
      args: {
        beforeDeleteHandle: v.optional(v.string()),
        input: deleteInput,
        onDeleteHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        deleteOneHandler(ctx, args, schema, betterAuthSchema),
    }),
    findMany: internalQueryGeneric({
      args: {
        limit: v.optional(v.number()),
        model: modelValidator,
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
        model: modelValidator,
        select: v.optional(v.array(v.string())),
        where: v.optional(v.array(adapterWhereValidator)),
      },
      handler: async (ctx, args) =>
        findOneHandler(ctx, args, schema, betterAuthSchema),
    }),
    updateMany: mutationBuilder({
      args: {
        beforeUpdateHandle: v.optional(v.string()),
        input: updateInput,
        paginationOpts: paginationOptsValidator,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateManyHandler(ctx, args, schema, betterAuthSchema),
    }),
    updateOne: mutationBuilder({
      args: {
        beforeUpdateHandle: v.optional(v.string()),
        input: updateInput,
        onUpdateHandle: v.optional(v.string()),
      },
      handler: async (ctx, args) =>
        updateOneHandler(ctx, args, schema, betterAuthSchema),
    }),
  };
};
