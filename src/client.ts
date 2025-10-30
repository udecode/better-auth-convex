import type { GenericCtx } from '@convex-dev/better-auth';
import type { BetterAuthOptions } from 'better-auth';

import {
  type FunctionReference,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericSchema,
  type IdField,
  type SchemaDefinition,
  type SystemFields,
  internalMutationGeneric,
} from 'convex/server';
import { type Infer, v } from 'convex/values';

import { dbAdapter, httpAdapter } from './adapter';

export type AuthFunctions = {
  create: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  deleteOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
  findMany: FunctionReference<'query', 'internal', Record<string, any>>;
  findOne: FunctionReference<'query', 'internal', Record<string, any>>;
  updateMany: FunctionReference<'mutation', 'internal', Record<string, any>>;
  updateOne: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onCreate: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onDelete: FunctionReference<'mutation', 'internal', Record<string, any>>;
  onUpdate: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeCreate?: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeDelete?: FunctionReference<'mutation', 'internal', Record<string, any>>;
  beforeUpdate?: FunctionReference<'mutation', 'internal', Record<string, any>>;
};

export type Triggers<
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<any, any>,
> = {
  [K in keyof Schema['tables'] & string]?: {
    beforeCreate?: (
      ctx: GenericMutationCtx<DataModel>,
      data: Infer<Schema['tables'][K]['validator']>
    ) => Promise<Infer<Schema['tables'][K]['validator']> | void>;
    beforeDelete?: (
      ctx: GenericMutationCtx<DataModel>,
      doc: Infer<Schema['tables'][K]['validator']> & IdField<K> & SystemFields
    ) => Promise<
      | (Infer<Schema['tables'][K]['validator']> & IdField<K> & SystemFields)
      | void
    >;
    beforeUpdate?: (
      ctx: GenericMutationCtx<DataModel>,
      doc: Infer<Schema['tables'][K]['validator']> & IdField<K> & SystemFields,
      update: Partial<Infer<Schema['tables'][K]['validator']>>
    ) => Promise<Partial<Infer<Schema['tables'][K]['validator']>> | void>;
    onCreate?: (
      ctx: GenericMutationCtx<DataModel>,
      doc: Infer<Schema['tables'][K]['validator']> & IdField<K> & SystemFields
    ) => Promise<void>;
    onDelete?: (
      ctx: GenericMutationCtx<DataModel>,
      doc: Infer<Schema['tables'][K]['validator']> & IdField<K> & SystemFields
    ) => Promise<void>;
    onUpdate?: (
      ctx: GenericMutationCtx<DataModel>,
      newDoc: Infer<Schema['tables'][K]['validator']> &
        IdField<K> & {
          _creationTime: number;
        },
      oldDoc: Infer<Schema['tables'][K]['validator']> &
        IdField<K> &
        SystemFields
    ) => Promise<void>;
  };
};

export const createClient = <
  DataModel extends GenericDataModel,
  Schema extends SchemaDefinition<GenericSchema, true>,
>(config: {
  authFunctions: AuthFunctions;
  schema: Schema;
  internalMutation?: typeof internalMutationGeneric;
  triggers?: Triggers<DataModel, Schema>;
}) => {
  return {
    authFunctions: config.authFunctions,
    triggers: config.triggers,
    adapter: (ctx: GenericCtx<DataModel>, options: BetterAuthOptions) =>
      dbAdapter(ctx, options, config),
    httpAdapter: (ctx: GenericCtx<DataModel>) => httpAdapter(ctx, config),
    triggersApi: () => {
      const mutationBuilder =
        config.internalMutation ?? internalMutationGeneric;

      return {
        beforeCreate: mutationBuilder({
          args: {
            data: v.any(),
            model: v.string(),
          },
          handler: async (ctx, args) => {
            return (
              (await config?.triggers?.[args.model]?.beforeCreate?.(
                ctx,
                args.data
              )) ?? args.data
            );
          },
        }),
        beforeDelete: mutationBuilder({
          args: {
            doc: v.any(),
            model: v.string(),
          },
          handler: async (ctx, args) => {
            return (
              (await config?.triggers?.[args.model]?.beforeDelete?.(
                ctx,
                args.doc
              )) ?? args.doc
            );
          },
        }),
        beforeUpdate: mutationBuilder({
          args: {
            doc: v.any(),
            model: v.string(),
            update: v.any(),
          },
          handler: async (ctx, args) => {
            return (
              (await config?.triggers?.[args.model]?.beforeUpdate?.(
                ctx,
                args.doc,
                args.update
              )) ?? args.update
            );
          },
        }),
        onCreate: mutationBuilder({
          args: {
            doc: v.any(),
            model: v.string(),
          },
          handler: async (ctx, args) => {
            await config?.triggers?.[args.model]?.onCreate?.(ctx, args.doc);
          },
        }),
        onDelete: mutationBuilder({
          args: {
            doc: v.any(),
            model: v.string(),
          },
          handler: async (ctx, args) => {
            await config?.triggers?.[args.model]?.onDelete?.(ctx, args.doc);
          },
        }),
        onUpdate: mutationBuilder({
          args: {
            model: v.string(),
            newDoc: v.any(),
            oldDoc: v.any(),
          },
          handler: async (ctx, args) => {
            await config?.triggers?.[args.model]?.onUpdate?.(
              ctx,
              args.newDoc,
              args.oldDoc
            );
          },
        }),
      };
    },
  };
};
