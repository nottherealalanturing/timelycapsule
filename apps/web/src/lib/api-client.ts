import {
  ApiErrorSchema,
  AuthResponseSchema,
  CapsuleActivityResponseSchema,
  CapsuleListResponseSchema,
  CapsuleResponseSchema,
  SystemTimeResponseSchema,
  AddCollectionItemRequestSchema,
  AvatarUploadRequestSchema,
  AvatarUploadResponseSchema,
  BlocksListResponseSchema,
  ChangeEmailRequestSchema,
  ChangePasswordRequestSchema,
  CollectionResponseSchema,
  CollectionsListResponseSchema,
  CompleteMediaRequestSchema,
  ConfirmEmailChangeRequestSchema,
  ContactGroupResponseSchema,
  ContactGroupsListResponseSchema,
  ContactResponseSchema,
  ContactsListResponseSchema,
  CreateBlockRequestSchema,
  CreateCapsuleRequestSchema,
  CreateCollectionRequestSchema,
  CreateContactGroupRequestSchema,
  CreateContactRequestSchema,
  CreateMediaTicketRequestSchema,
  CreateMediaTicketResponseSchema,
  CreateRecipientRequestSchema,
  CreateRecipientResponseSchema,
  CreateTagRequestSchema,
  DeleteAccountRequestSchema,
  DeletionPreviewResponseSchema,
  ExportResponseSchema,
  ExtendCapsuleRequestSchema,
  ForgotPasswordRequestSchema,
  GoogleOAuthRequestSchema,
  CreateGuestCapsuleRequestSchema,
  GuestCapsuleResponseSchema,
  GuestSessionResponseSchema,
  PatchGuestCapsuleRequestSchema,
  LoginRequestSchema,
  MediaListResponseSchema,
  MediaResponseSchema,
  MediaViewResponseSchema,
  MeResponseSchema,
  NotificationPrefsResponseSchema,
  NotificationPrefsSchema,
  PatchCapsuleRequestSchema,
  PatchCollectionRequestSchema,
  PatchContactGroupRequestSchema,
  PatchContactRequestSchema,
  PatchMediaRequestSchema,
  PatchMeRequestSchema,
  PatchRecipientRequestSchema,
  PatchTagRequestSchema,
  PlaceCheckRequestSchema,
  PlaceCheckResponseSchema,
  ReverseGeocodeRequestSchema,
  ReverseGeocodeResponseSchema,
  PutCapsuleTagsRequestSchema,
  PutFavoriteRequestSchema,
  ReplyListResponseSchema,
  ReplySchema,
  ReplyThreadListResponseSchema,
  SenderWriteReplyRequestSchema,
  WriteReplyRequestSchema,
  ReceivedListResponseSchema,
  RecipientResponseSchema,
  RecipientsListResponseSchema,
  RefreshResponseSchema,
  RemindRequestSchema,
  ReorderCollectionItemsRequestSchema,
  ReportRequestSchema,
  RequestIdentityCodeResponseSchema,
  ResetPasswordRequestSchema,
  RevealResponseSchema,
  SearchResponseSchema,
  SendAnnounceRequestSchema,
  SessionsResponseSchema,
  SetContactGroupMemberRequestSchema,
  SetInitialPasswordRequestSchema,
  SetOwnerKeyWrapRequestSchema,
  SignupRequestSchema,
  StorageResponseSchema,
  TagResponseSchema,
  TagsListResponseSchema,
  TzInferRequestSchema,
  VerifyEmailRequestSchema,
  VerifyIdentityRequestSchema,
  VerifyIdentityResponseSchema,
  type AddCollectionItemRequest,
  type AuthResponse,
  type AvatarUploadRequest,
  type ChangeEmailRequest,
  type ChangePasswordRequest,
  type CompleteMediaRequest,
  type ConfirmEmailChangeRequest,
  type CreateBlockRequest,
  type CreateCapsuleRequest,
  type CreateCollectionRequest,
  type CreateContactGroupRequest,
  type CreateContactRequest,
  type CreateMediaTicketRequest,
  type CreateRecipientRequest,
  type CreateTagRequest,
  type DeleteAccountRequest,
  type ExtendCapsuleRequest,
  type ForgotPasswordRequest,
  type GoogleOAuthRequest,
  type CreateGuestCapsuleRequest,
  type PatchGuestCapsuleRequest,
  type ListCapsulesQuery,
  type LoginRequest,
  type MeResponse,
  type NotificationPrefs,
  type PatchCapsuleRequest,
  type PatchCollectionRequest,
  type PatchContactGroupRequest,
  type PatchContactRequest,
  type PatchMediaRequest,
  type PatchMeRequest,
  type PatchRecipientRequest,
  type PatchTagRequest,
  type PlaceCheckRequest,
  type ReverseGeocodeRequest,
  type ReorderCollectionItemsRequest,
  type ReportRequest,
  type ResetPasswordRequest,
  type SetInitialPasswordRequest,
  type SignupRequest,
  type VerifyEmailRequest,
} from '@tc/contracts';
import { z } from 'zod';
import { clearTokens, getTokens, setTokens } from './token-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/v1';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// A refresh already in flight is shared by concurrent 401s instead of each
// firing its own — avoids racing the rotating-refresh-token endpoint (T-04
// revokes the whole session on reuse of an already-rotated-out token).
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) {
          clearTokens();
          return false;
        }
        const body = RefreshResponseSchema.parse(await res.json());
        setTokens(body.tokens);
        return true;
      } catch {
        clearTokens();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** A guest session token (T-15b) — mutually exclusive with `auth`, no refresh flow. */
  bearer?: string;
  /** internal: prevents infinite retry loops on the refresh call itself */
  _retried?: boolean;
}

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, bearer, _retried = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const tokens = getTokens();
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  } else if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request(path, schema, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    const raw = await res.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(raw);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status);
    }
    // Strict parsing alone was too brittle to be the only path. `requestId`
    // was going out as a number against a schema declaring a string, which
    // failed the whole envelope and erased the `code`/`message` from every
    // error in the app — the fault is fixed at the source, but a single
    // unrelated field drifting should never again cost us the two fields the
    // interface actually speaks to people with. So: if the parts we need are
    // present and well-typed, use them, whatever else the envelope carries.
    const loose = raw as { error?: { code?: unknown; message?: unknown } } | null;
    if (typeof loose?.error?.code === 'string' && typeof loose.error.message === 'string') {
      throw new ApiClientError(loose.error.code, loose.error.message, res.status);
    }
    throw new ApiClientError('internal_error', 'Something went wrong', res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return schema.parse(await res.json());
}

export const authApi = {
  signup: (input: SignupRequest) =>
    request('/auth/signup', AuthResponseSchema, { method: 'POST', body: SignupRequestSchema.parse(input) }),

  login: (input: LoginRequest) =>
    request('/auth/login', AuthResponseSchema, { method: 'POST', body: LoginRequestSchema.parse(input) }),

  googleOAuth: (input: GoogleOAuthRequest) =>
    request('/auth/oauth/google', AuthResponseSchema, {
      method: 'POST',
      body: GoogleOAuthRequestSchema.parse(input),
    }),

  logout: () => request('/auth/logout', z.void(), { method: 'POST', auth: true, body: {} }),

  verifyEmail: (input: VerifyEmailRequest) =>
    request('/auth/verify-email', MeResponseSchema, {
      method: 'POST',
      auth: true,
      body: VerifyEmailRequestSchema.parse(input),
    }),

  resendVerifyEmail: () => request('/auth/verify-email/resend', z.unknown(), { method: 'POST', auth: true }),

  forgotPassword: (input: ForgotPasswordRequest) =>
    request('/auth/password/forgot', z.unknown(), {
      method: 'POST',
      body: ForgotPasswordRequestSchema.parse(input),
    }),

  resetPassword: (input: ResetPasswordRequest) =>
    request('/auth/password/reset', z.unknown(), {
      method: 'POST',
      body: ResetPasswordRequestSchema.parse(input),
    }),

  getMe: () => request('/me', MeResponseSchema, { auth: true }),

  patchMe: (input: PatchMeRequest) =>
    request('/me', MeResponseSchema, { method: 'PATCH', auth: true, body: PatchMeRequestSchema.parse(input) }),

  changePassword: (input: ChangePasswordRequest) =>
    request('/auth/password/change', z.void(), { method: 'POST', auth: true, body: ChangePasswordRequestSchema.parse(input) }),

  setInitialPassword: (input: SetInitialPasswordRequest) =>
    request('/auth/password/set-initial', MeResponseSchema, {
      method: 'POST',
      auth: true,
      body: SetInitialPasswordRequestSchema.parse(input),
    }),

  requestEmailChange: (input: ChangeEmailRequest) =>
    request('/me/email/change', z.unknown(), { method: 'POST', auth: true, body: ChangeEmailRequestSchema.parse(input) }),

  confirmEmailChange: (input: ConfirmEmailChangeRequest) =>
    request('/me/email/confirm', MeResponseSchema, {
      method: 'POST',
      auth: true,
      body: ConfirmEmailChangeRequestSchema.parse(input),
    }),
};

export const systemApi = {
  time: () => request('/system/time', SystemTimeResponseSchema),
};

export const capsulesApi = {
  create: (input: CreateCapsuleRequest) =>
    request('/capsules', CapsuleResponseSchema, { method: 'POST', auth: true, body: CreateCapsuleRequestSchema.parse(input) }),

  list: (query: Partial<ListCapsulesQuery> = {}) => {
    const entries = Object.entries(query).filter(([, v]) => v !== undefined) as [string, string | number][];
    const params = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
    return request(`/capsules?${params}`, CapsuleListResponseSchema, { auth: true });
  },

  get: (id: string) => request(`/capsules/${id}`, CapsuleResponseSchema, { auth: true }),

  patch: (id: string, input: PatchCapsuleRequest) =>
    request(`/capsules/${id}`, CapsuleResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchCapsuleRequestSchema.partial().parse(input),
    }),

  setOwnerKeyWrap: (id: string, ownerKeyWrap: string) =>
    request(`/capsules/${id}/owner-key-wrap`, CapsuleResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: SetOwnerKeyWrapRequestSchema.parse({ ownerKeyWrap }),
    }),

  seal: (id: string) => request(`/capsules/${id}/seal`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  duplicate: (id: string) =>
    request(`/capsules/${id}/duplicate`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  archive: (id: string) => request(`/capsules/${id}/archive`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  unarchive: (id: string) =>
    request(`/capsules/${id}/unarchive`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  trash: (id: string) => request(`/capsules/${id}/trash`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  restore: (id: string) => request(`/capsules/${id}/restore`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  withdraw: (id: string) => request(`/capsules/${id}/withdraw`, CapsuleResponseSchema, { method: 'POST', auth: true, body: {} }),

  extend: (id: string, input: ExtendCapsuleRequest) =>
    request(`/capsules/${id}/extend`, CapsuleResponseSchema, {
      method: 'POST',
      auth: true,
      body: ExtendCapsuleRequestSchema.parse(input),
    }),

  activity: (id: string) => request(`/capsules/${id}/activity`, CapsuleActivityResponseSchema, { auth: true }),

  replies: (id: string) => request(`/capsules/${id}/replies`, ReplyThreadListResponseSchema, { auth: true }),

  reply: (id: string, recipientId: string, bodyEnc: string) =>
    request(`/capsules/${id}/replies`, z.object({ reply: ReplySchema }), {
      method: 'POST',
      auth: true,
      body: SenderWriteReplyRequestSchema.parse({ recipientId, bodyEnc }),
    }),

  purge: (id: string) => request(`/capsules/${id}/purge`, z.void(), { method: 'POST', auth: true, body: {} }),
};

export const recipientsApi = {
  list: (capsuleId: string) => request(`/capsules/${capsuleId}/recipients`, RecipientsListResponseSchema, { auth: true }),

  create: (capsuleId: string, input: CreateRecipientRequest) =>
    request(`/capsules/${capsuleId}/recipients`, CreateRecipientResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateRecipientRequestSchema.parse(input),
    }),

  patch: (capsuleId: string, recipientId: string, input: PatchRecipientRequest) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}`, RecipientResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchRecipientRequestSchema.parse(input),
    }),

  delete: (capsuleId: string, recipientId: string) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}`, z.void(), { method: 'DELETE', auth: true }),

  /**
   * The server never holds the capsule key that goes in `link`'s `#k=`
   * fragment (T-14 decisions log) — this client-constructed link is
   * relayed through unparsed, dropped straight into the announce email.
   */
  announce: (capsuleId: string, recipientId: string, link: string) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}/announce`, z.object({}), {
      method: 'POST',
      auth: true,
      body: SendAnnounceRequestSchema.parse({ link }),
    }),

  resendInvite: (capsuleId: string, recipientId: string, link: string) =>
    request(`/capsules/${capsuleId}/recipients/${recipientId}/resend-invite`, z.object({}), {
      method: 'POST',
      auth: true,
      body: SendAnnounceRequestSchema.parse({ link }),
    }),
};

export const mediaApi = {
  list: (capsuleId: string) => request(`/capsules/${capsuleId}/media`, MediaListResponseSchema, { auth: true }),

  createTicket: (capsuleId: string, input: CreateMediaTicketRequest) =>
    request(`/capsules/${capsuleId}/media/tickets`, CreateMediaTicketResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateMediaTicketRequestSchema.parse(input),
    }),

  complete: (mediaId: string, input: CompleteMediaRequest) =>
    request(`/media/${mediaId}/complete`, MediaResponseSchema, {
      method: 'POST',
      auth: true,
      body: CompleteMediaRequestSchema.parse(input),
    }),

  patch: (mediaId: string, input: PatchMediaRequest) =>
    request(`/media/${mediaId}`, MediaResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchMediaRequestSchema.parse(input),
    }),

  delete: (mediaId: string) => request(`/media/${mediaId}`, z.void(), { method: 'DELETE', auth: true }),

  view: (mediaId: string) => request(`/media/${mediaId}/view`, MediaViewResponseSchema, { auth: true }),
};

export const revealApi = {
  get: (token: string, gates: { placeGate?: string; identityGate?: string } = {}) => {
    const query = new URLSearchParams();
    if (gates.placeGate) query.set('placeGate', gates.placeGate);
    if (gates.identityGate) query.set('identityGate', gates.identityGate);
    const qs = query.toString();
    return request(`/r/${token}${qs ? `?${qs}` : ''}`, RevealResponseSchema);
  },

  requestIdentityCode: (token: string) =>
    request(`/r/${token}/verify/request`, RequestIdentityCodeResponseSchema, { method: 'POST', body: {} }),

  verifyIdentity: (token: string, code: string) =>
    request(`/r/${token}/verify`, VerifyIdentityResponseSchema, {
      method: 'POST',
      body: VerifyIdentityRequestSchema.parse({ code }),
    }),

  placeCheck: (token: string, input: PlaceCheckRequest) =>
    request(`/r/${token}/place-check`, PlaceCheckResponseSchema, {
      method: 'POST',
      body: PlaceCheckRequestSchema.parse(input),
    }),

  remind: (token: string, enabled: boolean) =>
    request(`/r/${token}/remind`, z.void(), { method: 'POST', body: RemindRequestSchema.parse({ enabled }) }),

  listReplies: (token: string) => request(`/r/${token}/replies`, ReplyListResponseSchema),

  reply: (token: string, bodyEnc: string) =>
    request(`/r/${token}/replies`, z.object({ reply: ReplySchema }), {
      method: 'POST',
      body: WriteReplyRequestSchema.parse({ bodyEnc }),
    }),

  report: (token: string, input: ReportRequest) =>
    request(`/r/${token}/report`, z.void(), { method: 'POST', body: ReportRequestSchema.parse(input) }),

  tzInfer: (token: string, tz: string) =>
    request(`/r/${token}/tz-infer`, z.void(), { method: 'POST', body: TzInferRequestSchema.parse({ tz }) }),

  save: (token: string) => request(`/r/${token}/save`, z.void(), { method: 'POST', auth: true, body: {} }),
};

export const guestApi = {
  createSession: () => request('/guest/sessions', GuestSessionResponseSchema, { method: 'POST', body: {} }),

  createCapsule: (guestToken: string, input: CreateGuestCapsuleRequest) =>
    request('/guest/capsules', GuestCapsuleResponseSchema, {
      method: 'POST',
      bearer: guestToken,
      body: CreateGuestCapsuleRequestSchema.parse(input),
    }),

  patchCapsule: (guestToken: string, capsuleId: string, input: PatchGuestCapsuleRequest) =>
    request(`/guest/capsules/${capsuleId}`, GuestCapsuleResponseSchema, {
      method: 'PATCH',
      bearer: guestToken,
      body: PatchGuestCapsuleRequestSchema.parse(input),
    }),

  sealCapsule: (guestToken: string, capsuleId: string) =>
    request(`/guest/capsules/${capsuleId}/seal`, GuestCapsuleResponseSchema, { method: 'POST', bearer: guestToken, body: {} }),

  replies: (guestToken: string, capsuleId: string) =>
    request(`/guest/capsules/${capsuleId}/replies`, ReplyThreadListResponseSchema, { bearer: guestToken }),

  getCapsule: (guestToken: string, capsuleId: string) =>
    request(`/guest/capsules/${capsuleId}`, GuestCapsuleResponseSchema, { bearer: guestToken }),
};

export const receivedApi = {
  list: () => request('/received', ReceivedListResponseSchema, { auth: true }),

  report: (recipientId: string, input: ReportRequest) =>
    request(`/received/${recipientId}/report`, z.void(), { method: 'POST', auth: true, body: ReportRequestSchema.parse(input) }),
};

export const blocksApi = {
  list: () => request('/blocks', BlocksListResponseSchema, { auth: true }),

  create: (input: CreateBlockRequest) =>
    request('/blocks', z.object({ block: z.unknown() }), { method: 'POST', auth: true, body: CreateBlockRequestSchema.parse(input) }),

  delete: (email: string) => request(`/blocks/${encodeURIComponent(email)}`, z.void(), { method: 'DELETE', auth: true }),
};

export const contactsApi = {
  list: () => request('/contacts', ContactsListResponseSchema, { auth: true }),

  create: (input: CreateContactRequest) =>
    request('/contacts', ContactResponseSchema, { method: 'POST', auth: true, body: CreateContactRequestSchema.parse(input) }),

  patch: (id: string, input: PatchContactRequest) =>
    request(`/contacts/${id}`, ContactResponseSchema, { method: 'PATCH', auth: true, body: PatchContactRequestSchema.parse(input) }),

  delete: (id: string) => request(`/contacts/${id}`, z.void(), { method: 'DELETE', auth: true }),
};

export const contactGroupsApi = {
  list: () => request('/contact-groups', ContactGroupsListResponseSchema, { auth: true }),

  create: (input: CreateContactGroupRequest) =>
    request('/contact-groups', ContactGroupResponseSchema, {
      method: 'POST',
      auth: true,
      body: CreateContactGroupRequestSchema.parse(input),
    }),

  patch: (id: string, input: PatchContactGroupRequest) =>
    request(`/contact-groups/${id}`, ContactGroupResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchContactGroupRequestSchema.parse(input),
    }),

  delete: (id: string) => request(`/contact-groups/${id}`, z.void(), { method: 'DELETE', auth: true }),

  addMember: (groupId: string, contactId: string) =>
    request(`/contact-groups/${groupId}/members`, z.void(), {
      method: 'POST',
      auth: true,
      body: SetContactGroupMemberRequestSchema.parse({ contactId }),
    }),

  removeMember: (groupId: string, contactId: string) =>
    request(`/contact-groups/${groupId}/members/${contactId}`, z.void(), { method: 'DELETE', auth: true }),
};

export const tagsApi = {
  list: () => request('/tags', TagsListResponseSchema, { auth: true }),

  create: (input: CreateTagRequest) =>
    request('/tags', TagResponseSchema, { method: 'POST', auth: true, body: CreateTagRequestSchema.parse(input) }),

  patch: (id: string, input: PatchTagRequest) =>
    request(`/tags/${id}`, TagResponseSchema, { method: 'PATCH', auth: true, body: PatchTagRequestSchema.parse(input) }),

  delete: (id: string) => request(`/tags/${id}`, z.void(), { method: 'DELETE', auth: true }),

  putForCapsule: (capsuleId: string, tagIds: string[]) =>
    request(`/capsules/${capsuleId}/tags`, z.void(), {
      method: 'PUT',
      auth: true,
      body: PutCapsuleTagsRequestSchema.parse({ tagIds }),
    }),
};

export const favoritesApi = {
  set: (capsuleId: string, value: boolean) =>
    request(`/capsules/${capsuleId}/favorite`, z.void(), {
      method: 'PUT',
      auth: true,
      body: PutFavoriteRequestSchema.parse({ value }),
    }),
};

export const collectionsApi = {
  list: () => request('/collections', CollectionsListResponseSchema, { auth: true }),

  create: (input: CreateCollectionRequest) =>
    request('/collections', CollectionResponseSchema, { method: 'POST', auth: true, body: CreateCollectionRequestSchema.parse(input) }),

  patch: (id: string, input: PatchCollectionRequest) =>
    request(`/collections/${id}`, CollectionResponseSchema, {
      method: 'PATCH',
      auth: true,
      body: PatchCollectionRequestSchema.parse(input),
    }),

  delete: (id: string) => request(`/collections/${id}`, z.void(), { method: 'DELETE', auth: true }),

  addItem: (collectionId: string, input: AddCollectionItemRequest) =>
    request(`/collections/${collectionId}/items`, z.void(), {
      method: 'POST',
      auth: true,
      body: AddCollectionItemRequestSchema.parse(input),
    }),

  removeItem: (collectionId: string, capsuleId: string) =>
    request(`/collections/${collectionId}/items/${capsuleId}`, z.void(), { method: 'DELETE', auth: true }),

  reorderItems: (collectionId: string, input: ReorderCollectionItemsRequest) =>
    request(`/collections/${collectionId}/items`, z.void(), {
      method: 'PUT',
      auth: true,
      body: ReorderCollectionItemsRequestSchema.parse(input),
    }),
};

export const searchApi = {
  query: (q: string) => request(`/search?q=${encodeURIComponent(q)}`, SearchResponseSchema, { auth: true }),
};

export const sessionsApi = {
  list: () => request('/auth/sessions', SessionsResponseSchema, { auth: true }),

  revoke: (id: string) => request(`/auth/sessions/${id}`, z.void(), { method: 'DELETE', auth: true }),
};

export const notificationPrefsApi = {
  get: () => request('/me/notification-prefs', NotificationPrefsResponseSchema, { auth: true }),

  put: (input: NotificationPrefs) =>
    request('/me/notification-prefs', NotificationPrefsResponseSchema, {
      method: 'PUT',
      auth: true,
      body: NotificationPrefsSchema.parse(input),
    }),
};

export const settingsApi = {
  getStorage: () => request('/me/storage', StorageResponseSchema, { auth: true }),

  createAvatarUpload: (input: AvatarUploadRequest) =>
    request('/me/avatar', AvatarUploadResponseSchema, { method: 'POST', auth: true, body: AvatarUploadRequestSchema.parse(input) }),

  requestExport: () => request('/me/export', ExportResponseSchema, { method: 'POST', auth: true, body: {} }),

  getDeletionPreview: () => request('/me/deletion-preview', DeletionPreviewResponseSchema, { auth: true }),

  deleteAccount: (input: DeleteAccountRequest) =>
    request('/me', z.unknown(), { method: 'DELETE', auth: true, body: DeleteAccountRequestSchema.parse(input) }),
};

/**
 * A single, explicit action (PlaceMemoryDialog's "Look up this place"
 * button) — never called just because coordinates exist. See
 * packages/contracts/src/places.ts for why this is stateless server-side.
 */
export const placesApi = {
  reverseGeocode: (input: ReverseGeocodeRequest) =>
    request('/places/reverse-geocode', ReverseGeocodeResponseSchema, {
      method: 'POST',
      auth: true,
      body: ReverseGeocodeRequestSchema.parse(input),
    }),
};

export type { AuthResponse, MeResponse };
