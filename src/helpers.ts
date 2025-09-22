import type {
  DocumentByName,
  GenericDataModel,
  GenericQueryCtx,
} from 'convex/server';

export const getAuthUserId = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>
) => {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return identity.subject as DocumentByName<DataModel, 'user'>['_id'];
};

export const getSession = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>
) => {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    return null;
  }

  return (await ctx.db
    .query('session' as any)
    .withIndex('userId', (q) => q.eq('userId', userId as any))
    .order('desc')
    .first()) as DocumentByName<DataModel, 'session'> | null;
};

export const getHeaders = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>
) => {
  const session = await getSession(ctx);

  if (!session) {
    return new Headers();
  }

  return new Headers({
    ...(session?.token ? { authorization: `Bearer ${session.token}` } : {}),
    ...(session?.ipAddress
      ? { 'x-forwarded-for': session.ipAddress as string }
      : {}),
  });
};
