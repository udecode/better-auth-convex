import type { GenericCtx } from '@convex-dev/better-auth';
import type { BetterAuthOptions, Where } from 'better-auth';
import type { SetOptional } from 'type-fest';

import { isRunMutationCtx } from '@convex-dev/better-auth/utils';
import {
  type AdapterFactoryOptions,
  type DBAdapterDebugLogOption,
  createAdapterFactory,
} from 'better-auth/adapters';
import { getAuthTables } from 'better-auth/db';
import { asyncMap } from 'convex-helpers';
import {
  type FunctionHandle,
  type GenericDataModel,
  type PaginationOptions,
  type PaginationResult,
  type SchemaDefinition,
  createFunctionHandle,
} from 'convex/server';
import { prop, sortBy, unique } from 'remeda';

import type { AuthFunctions, Triggers } from './client';

import {
  createHandler,
  deleteManyHandler,
  deleteOneHandler,
  findManyHandler,
  findOneHandler,
  updateManyHandler,
  updateOneHandler,
} from './api';

export const handlePagination = async (
  next: ({
    paginationOpts,
  }: {
    paginationOpts: PaginationOptions;
  }) => Promise<
    SetOptional<PaginationResult<any>, 'page'> & { count?: number }
  >,
  { limit, numItems }: { limit?: number; numItems?: number } = {}
) => {
  const state: {
    count: number;
    cursor: string | null;
    docs: any[];
    isDone: boolean;
  } = {
    count: 0,
    cursor: null,
    docs: [],
    isDone: false,
  };
  const onResult = (
    result: SetOptional<PaginationResult<any>, 'page'> & { count?: number }
  ) => {
    state.cursor =
      result.pageStatus === 'SplitRecommended' ||
      result.pageStatus === 'SplitRequired'
        ? (result.splitCursor ?? result.continueCursor)
        : result.continueCursor;

    if (result.page) {
      state.docs.push(...result.page);
      state.isDone = (limit && state.docs.length >= limit) || result.isDone;

      return;
    }
    // Update and delete only return a count
    if (result.count) {
      state.count += result.count;
      state.isDone = (limit && state.count >= limit) || result.isDone;

      return;
    }

    state.isDone = result.isDone;
  };

  do {
    const result = await next({
      paginationOpts: {
        cursor: state.cursor,
        numItems: Math.min(
          numItems ?? 200,
          (limit ?? 200) - state.docs.length,
          200
        ),
      },
    });
    onResult(result);
  } while (!state.isDone);

  return state;
};

export type ConvexCleanedWhere = Where & {
  value: number[] | string[] | boolean | number | string | null;
};

export const parseWhere = (where?: Where[]): ConvexCleanedWhere[] => {
  return where?.map((where) => {
    if (where.value instanceof Date) {
      return {
        ...where,
        value: where.value.getTime(),
      };
    }

    return where;
  }) as ConvexCleanedWhere[];
};

export const adapterConfig = {
  adapterId: 'convex',
  adapterName: 'Convex Adapter',
  debugLogs: false,
  disableIdGeneration: true,
  mapKeysTransformInput: {
    id: '_id',
  },
  mapKeysTransformOutput: {
    _id: 'id',
  },
  supportsJSON: false,
  supportsNumericIds: false,
  transaction: false,
  usePlural: false,
  // With supportsDates: false, dates are stored as strings,
  // we convert them to numbers here. This aligns with how
  // Convex stores _creationTime, and avoids a breaking change.
  supportsDates: false,
  customTransformInput: ({ data, fieldAttributes }) => {
    if (data && fieldAttributes.type === 'date') {
      return new Date(data).getTime();
    }

    return data;
  },
  customTransformOutput: ({ data, fieldAttributes }) => {
    if (data && fieldAttributes.type === 'date') {
      return new Date(data).getTime();
    }

    return data;
  },
} satisfies AdapterFactoryOptions['config'];

export const httpAdapter = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
>(
  ctx: GenericCtx<DataModel>,
  {
    authFunctions,
    debugLogs,
    triggers,
  }: {
    authFunctions: AuthFunctions;
    debugLogs?: DBAdapterDebugLogOption;
    triggers?: Triggers<DataModel, Schema>;
  }
) => {
  return createAdapterFactory({
    config: {
      ...adapterConfig,
      debugLogs: debugLogs || false,
    },
    adapter: ({ options }) => {
      // Disable telemetry in all cases because it requires Node
      options.telemetry = { enabled: false };

      return {
        id: 'convex',
        options: {
          isRunMutationCtx: isRunMutationCtx(ctx),
        },
        count: async (data) => {
          // Yes, count is just findMany returning a number.
          if (data.where?.some((w) => w.connector === 'OR')) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(async ({ paginationOpts }) => {
                return await ctx.runQuery(authFunctions.findMany, {
                  ...data,
                  paginationOpts,
                  where: parseWhere([w]),
                });
              })
            );
            const docs = unique(results.flatMap((r) => r.docs));

            return docs.length;
          }

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runQuery(authFunctions.findMany, {
              ...data,
              paginationOpts,
              where: parseWhere(data.where),
            });
          });

          return result.docs.length;
        },
        create: async ({ data, model, select }): Promise<any> => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          const onCreateHandle =
            authFunctions.onCreate && triggers?.[model]?.onCreate
              ? ((await createFunctionHandle(
                  authFunctions.onCreate
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeCreateHandle =
            authFunctions.beforeCreate && triggers?.[model]?.beforeCreate
              ? ((await createFunctionHandle(
                  authFunctions.beforeCreate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          return ctx.runMutation(authFunctions.create, {
            beforeCreateHandle: beforeCreateHandle,
            input: { data, model },
            select,
            onCreateHandle: onCreateHandle,
          });
        },
        createSchema: async ({ file, tables }) => {
          const { createSchema } = await import('./createSchema');

          return createSchema({ file, tables });
        },
        delete: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          const onDeleteHandle =
            authFunctions.onDelete && triggers?.[data.model]?.onDelete
              ? ((await createFunctionHandle(
                  authFunctions.onDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeDeleteHandle =
            authFunctions.beforeDelete && triggers?.[data.model]?.beforeDelete
              ? ((await createFunctionHandle(
                  authFunctions.beforeDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          await ctx.runMutation(authFunctions.deleteOne, {
            beforeDeleteHandle: beforeDeleteHandle,
            input: {
              model: data.model,
              where: parseWhere(data.where),
            },
            onDeleteHandle: onDeleteHandle,
          });
        },
        deleteMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          const onDeleteHandle =
            authFunctions.onDelete && triggers?.[data.model]?.onDelete
              ? ((await createFunctionHandle(
                  authFunctions.onDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeDeleteHandle =
            authFunctions.beforeDelete && triggers?.[data.model]?.beforeDelete
              ? ((await createFunctionHandle(
                  authFunctions.beforeDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runMutation(authFunctions.deleteMany, {
              beforeDeleteHandle: beforeDeleteHandle,
              input: {
                ...data,
                where: parseWhere(data.where),
              },
              paginationOpts,
              onDeleteHandle: onDeleteHandle,
            });
          });

          return result.count;
        },
        findMany: async (data): Promise<any[]> => {
          if (data.offset) {
            throw new Error('offset not supported');
          }
          if (data.where?.some((w) => w.connector === 'OR')) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) => {
                  return await ctx.runQuery(authFunctions.findMany, {
                    ...data,
                    paginationOpts,
                    where: parseWhere([w]),
                  });
                },
                { limit: data.limit }
              )
            );
            const docs = unique(results.flatMap((r) => r.docs));

            if (data.sortBy) {
              const result = sortBy(docs, [
                prop(data.sortBy.field),
                data.sortBy.direction,
              ]);

              return result;
            }

            return docs;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) => {
              return await ctx.runQuery(authFunctions.findMany, {
                ...data,
                paginationOpts,
                where: parseWhere(data.where),
              });
            },
            { limit: data.limit }
          );

          return result.docs;
        },
        findOne: async (data): Promise<any> => {
          if (data.where?.every((w) => w.connector === 'OR')) {
            for (const w of data.where) {
              const result: any = await ctx.runQuery(authFunctions.findOne, {
                ...data,
                where: parseWhere([w]),
              });

              if (result) {
                return result;
              }
            }
          }

          return await ctx.runQuery(authFunctions.findOne, {
            ...data,
            where: parseWhere(data.where),
          });
        },
        update: async (data): Promise<any> => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }
          if (data.where?.length === 1 && data.where[0].operator === 'eq') {
            const onUpdateHandle =
              authFunctions.onUpdate && triggers?.[data.model]?.onUpdate
                ? ((await createFunctionHandle(
                    authFunctions.onUpdate
                  )) as FunctionHandle<'mutation'>)
                : undefined;
            const beforeUpdateHandle =
              authFunctions.beforeUpdate && triggers?.[data.model]?.beforeUpdate
                ? ((await createFunctionHandle(
                    authFunctions.beforeUpdate
                  )) as FunctionHandle<'mutation'>)
                : undefined;

            return ctx.runMutation(authFunctions.updateOne, {
              beforeUpdateHandle: beforeUpdateHandle,
              input: {
                model: data.model as any,
                update: data.update as any,
                where: parseWhere(data.where),
              },
              onUpdateHandle: onUpdateHandle,
            });
          }

          throw new Error('where clause not supported');
        },
        updateMany: async (data) => {
          if (!('runMutation' in ctx)) {
            throw new Error('ctx is not a mutation ctx');
          }

          const onUpdateHandle =
            authFunctions.onUpdate && triggers?.[data.model]?.onUpdate
              ? ((await createFunctionHandle(
                  authFunctions.onUpdate
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeUpdateHandle =
            authFunctions.beforeUpdate && triggers?.[data.model]?.beforeUpdate
              ? ((await createFunctionHandle(
                  authFunctions.beforeUpdate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runMutation(authFunctions.updateMany, {
              beforeUpdateHandle: beforeUpdateHandle,
              input: {
                ...(data as any),
                where: parseWhere(data.where),
              },
              paginationOpts,
              onUpdateHandle: onUpdateHandle,
            });
          });

          return result.count;
        },
      };
    },
  });
};

export const dbAdapter = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
>(
  ctx: GenericCtx<DataModel>,
  options: BetterAuthOptions,
  {
    authFunctions,
    debugLogs,
    schema,
    triggers,
  }: {
    authFunctions: AuthFunctions;
    schema: Schema;
    debugLogs?: DBAdapterDebugLogOption;
    triggers?: Triggers<DataModel, Schema>;
  }
) => {
  const betterAuthSchema = getAuthTables(options);

  return createAdapterFactory({
    config: {
      ...adapterConfig,
      debugLogs: debugLogs || false,
    },
    adapter: ({ options }) => {
      // Disable telemetry in all cases because it requires Node
      options.telemetry = { enabled: false };

      return {
        id: 'convex',
        options: {
          isRunMutationCtx: isRunMutationCtx(ctx),
        },
        count: async (data) => {
          if (data.where?.some((w) => w.connector === 'OR')) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(async ({ paginationOpts }) => {
                return await findManyHandler(
                  ctx,
                  {
                    ...data,
                    paginationOpts,
                    where: parseWhere([w]),
                  },
                  schema,
                  betterAuthSchema
                );
              })
            );
            const docs = unique(results.flatMap((r) => r.docs));

            return docs.length;
          }

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await findManyHandler(
              ctx,
              {
                ...data,
                paginationOpts,
                where: parseWhere(data.where),
              },
              schema,
              betterAuthSchema
            );
          });

          return result.docs.length;
        },
        create: async ({ data, model, select }): Promise<any> => {
          const onCreateHandle =
            authFunctions.onCreate && triggers?.[model]?.onCreate
              ? ((await createFunctionHandle(
                  authFunctions.onCreate
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeCreateHandle =
            authFunctions.beforeCreate && triggers?.[model]?.beforeCreate
              ? ((await createFunctionHandle(
                  authFunctions.beforeCreate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          return createHandler(
            ctx,
            {
              beforeCreateHandle: beforeCreateHandle,
              input: { data, model },
              select,
              onCreateHandle: onCreateHandle,
            },
            schema,
            betterAuthSchema
          );
        },
        createSchema: async ({ file, tables }) => {
          const { createSchema } = await import('./createSchema');

          return createSchema({ file, tables });
        },
        delete: async (data) => {
          const onDeleteHandle =
            authFunctions.onDelete && triggers?.[data.model]?.onDelete
              ? ((await createFunctionHandle(
                  authFunctions.onDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeDeleteHandle =
            authFunctions.beforeDelete && triggers?.[data.model]?.beforeDelete
              ? ((await createFunctionHandle(
                  authFunctions.beforeDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;

          await deleteOneHandler(
            ctx,
            {
              beforeDeleteHandle: beforeDeleteHandle,
              input: {
                model: data.model,
                where: parseWhere(data.where),
              },
              onDeleteHandle: onDeleteHandle,
            },
            schema,
            betterAuthSchema
          );
        },
        deleteMany: async (data) => {
          const onDeleteHandle =
            authFunctions.onDelete && triggers?.[data.model]?.onDelete
              ? ((await createFunctionHandle(
                  authFunctions.onDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeDeleteHandle =
            authFunctions.beforeDelete && triggers?.[data.model]?.beforeDelete
              ? ((await createFunctionHandle(
                  authFunctions.beforeDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await deleteManyHandler(
              ctx,
              {
                beforeDeleteHandle: beforeDeleteHandle,
                input: {
                  ...data,
                  where: parseWhere(data.where),
                },
                paginationOpts,
                onDeleteHandle: onDeleteHandle,
              },
              schema,
              betterAuthSchema
            );
          });

          return result.count;
        },
        findMany: async (data): Promise<any[]> => {
          if (data.offset) {
            throw new Error('offset not supported');
          }
          if (data.where?.some((w) => w.connector === 'OR')) {
            const results = await asyncMap(data.where, async (w) =>
              handlePagination(
                async ({ paginationOpts }) => {
                  return await findManyHandler(
                    ctx,
                    {
                      ...data,
                      paginationOpts,
                      where: parseWhere([w]),
                    },
                    schema,
                    betterAuthSchema
                  );
                },
                { limit: data.limit }
              )
            );
            const docs = unique(results.flatMap((r) => r.docs));

            if (data.sortBy) {
              const result = sortBy(docs, [
                prop(data.sortBy.field),
                data.sortBy.direction,
              ]);

              return result;
            }

            return docs;
          }

          const result = await handlePagination(
            async ({ paginationOpts }) => {
              return await findManyHandler(
                ctx,
                {
                  ...data,
                  paginationOpts,
                  where: parseWhere(data.where),
                },
                schema,
                betterAuthSchema
              );
            },
            { limit: data.limit }
          );

          return result.docs;
        },
        findOne: async (data): Promise<any> => {
          if (data.where?.every((w) => w.connector === 'OR')) {
            for (const w of data.where) {
              const result = await findOneHandler(
                ctx,
                {
                  ...data,
                  where: parseWhere([w]),
                },
                schema,
                betterAuthSchema
              );

              if (result) {
                return result;
              }
            }
          }

          return await findOneHandler(
            ctx,
            {
              ...data,
              where: parseWhere(data.where),
            },
            schema,
            betterAuthSchema
          );
        },
        update: async (data): Promise<any> => {
          if (data.where?.length === 1 && data.where[0].operator === 'eq') {
            const onUpdateHandle =
              authFunctions.onUpdate && triggers?.[data.model]?.onUpdate
                ? ((await createFunctionHandle(
                    authFunctions.onUpdate
                  )) as FunctionHandle<'mutation'>)
                : undefined;
            const beforeUpdateHandle =
              authFunctions.beforeUpdate && triggers?.[data.model]?.beforeUpdate
                ? ((await createFunctionHandle(
                    authFunctions.beforeUpdate
                  )) as FunctionHandle<'mutation'>)
                : undefined;

            return updateOneHandler(
              ctx,
              {
                beforeUpdateHandle: beforeUpdateHandle,
                input: {
                  model: data.model as any,
                  update: data.update as any,
                  where: parseWhere(data.where),
                },
                onUpdateHandle: onUpdateHandle,
              },
              schema,
              betterAuthSchema
            );
          }

          throw new Error('where clause not supported');
        },
        updateMany: async (data) => {
          const onUpdateHandle =
            authFunctions.onUpdate && triggers?.[data.model]?.onUpdate
              ? ((await createFunctionHandle(
                  authFunctions.onUpdate
                )) as FunctionHandle<'mutation'>)
              : undefined;
          const beforeUpdateHandle =
            authFunctions.beforeUpdate && triggers?.[data.model]?.beforeUpdate
              ? ((await createFunctionHandle(
                  authFunctions.beforeUpdate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await updateManyHandler(
              ctx,
              {
                beforeUpdateHandle: beforeUpdateHandle,
                input: {
                  ...(data as any),
                  where: parseWhere(data.where),
                },
                paginationOpts,
                onUpdateHandle: onUpdateHandle,
              },
              schema,
              betterAuthSchema
            );
          });

          return result.count;
        },
      };
    },
  });
};
