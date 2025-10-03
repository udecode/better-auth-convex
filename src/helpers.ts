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
  ctx: GenericQueryCtx<DataModel>,
  _sessionId?: any
) => {
  let sessionId = _sessionId;

  if (!sessionId) {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    sessionId = identity.sessionId as any;
  }

  return (await ctx.db.get(sessionId)) as DocumentByName<
    DataModel,
    'session'
  > | null;
};

export const getHeaders = async <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  session?: DocumentByName<DataModel, 'session'> | null
) => {
  const resolvedSession = session ?? (await getSession(ctx));

  if (!resolvedSession) {
    return new Headers();
  }

  return new Headers({
    ...(resolvedSession?.token
      ? { authorization: `Bearer ${resolvedSession.token}` }
      : {}),
    ...(resolvedSession?.ipAddress
      ? { 'x-forwarded-for': resolvedSession.ipAddress as string }
      : {}),
  });
};
