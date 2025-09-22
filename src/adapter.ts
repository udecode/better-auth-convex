import type { GenericCtx } from '@convex-dev/better-auth';
import type { BetterAuthOptions, Prettify, Where } from 'better-auth';
import type { SetOptional } from 'type-fest';

import {
  type AdapterDebugLogs,
  type AdapterFactoryOptions,
  createAdapterFactory,
} from 'better-auth/adapters';
import { getAuthTables } from 'better-auth/db';
import {
  type FunctionHandle,
  type GenericDataModel,
  type PaginationOptions,
  type PaginationResult,
  type SchemaDefinition,
  createFunctionHandle,
} from 'convex/server';

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
import { createSchema } from './createSchema';

type CleanedWhere = Prettify<Required<Where>>;

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

export type ConvexCleanedWhere = CleanedWhere & {
  value: number[] | string[] | boolean | number | string | null;
};

export const parseWhere = (where?: CleanedWhere[]): ConvexCleanedWhere[] => {
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
  mapKeysTransformOutput: {
    _id: 'id',
  },
  supportsNumericIds: false,
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
    debugLogs?: AdapterDebugLogs;
    triggers?: Triggers<DataModel, Schema>;
  }
) => {
  return createAdapterFactory({
    config: {
      ...adapterConfig,
      debugLogs: debugLogs || false,
    },
    adapter: ({ options }) => {
      options.telemetry = { enabled: false };

      return {
        id: 'convex',
        createSchema,
        count: async (data) => {
          // Yes, count is just findMany returning a number.
          if (data.where?.some((w) => w.connector === 'OR')) {
            throw new Error('OR connector not supported in findMany');
          }

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runQuery(authFunctions.findMany, {
              ...data,
              paginationOpts,
              where: parseWhere(data.where),
            });
          });

          return result.docs?.length ?? 0;
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

          return ctx.runMutation(authFunctions.create, {
            input: { data, model },
            select,
            onCreateHandle: onCreateHandle,
          });
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
          await ctx.runMutation(authFunctions.deleteOne, {
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
          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runMutation(authFunctions.deleteMany, {
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
            throw new Error('OR connector not supported in findMany');
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

            return ctx.runMutation(authFunctions.updateOne, {
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
            throw new Error('ctx is not an action ctx');
          }

          const onUpdateHandle =
            authFunctions.onUpdate && triggers?.[data.model]?.onUpdate
              ? ((await createFunctionHandle(
                  authFunctions.onUpdate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await ctx.runMutation(authFunctions.updateMany, {
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
    debugLogs?: AdapterDebugLogs;
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
      options.telemetry = { enabled: false };

      return {
        id: 'convex',
        createSchema,
        count: async (data) => {
          if (data.where?.some((w) => w.connector === 'OR')) {
            throw new Error('OR connector not supported in findMany');
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

          return result.docs?.length ?? 0;
        },
        create: async ({ data, model, select }): Promise<any> => {
          const onCreateHandle =
            authFunctions.onCreate && triggers?.[model]?.onCreate
              ? ((await createFunctionHandle(
                  authFunctions.onCreate
                )) as FunctionHandle<'mutation'>)
              : undefined;

          return createHandler(
            ctx,
            {
              input: { data, model },
              select,
              onCreateHandle: onCreateHandle,
            },
            schema,
            betterAuthSchema
          );
        },
        delete: async (data) => {
          const onDeleteHandle =
            authFunctions.onDelete && triggers?.[data.model]?.onDelete
              ? ((await createFunctionHandle(
                  authFunctions.onDelete
                )) as FunctionHandle<'mutation'>)
              : undefined;

          await deleteOneHandler(
            ctx,
            {
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

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await deleteManyHandler(
              ctx,
              {
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
            throw new Error('OR connector not supported in findMany');
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

            return updateOneHandler(
              ctx,
              {
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

          const result = await handlePagination(async ({ paginationOpts }) => {
            return await updateManyHandler(
              ctx,
              {
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
