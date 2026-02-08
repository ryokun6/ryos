import {
  type RefreshTokenHandler,
  makeAuthenticatedRequest,
} from "./authRequests";

export interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

interface CreateRoomRequestParams {
  name: string;
  type: "public" | "private";
  members: string[];
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const createRoomRequest = async ({
  name,
  type,
  members,
  authToken,
  username,
  refreshAuthToken,
}: CreateRoomRequestParams): Promise<Response> => {
  const payload: CreateRoomPayload = { type };
  if (type === "public") {
    payload.name = name.trim();
  } else {
    payload.members = members;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    "/api/rooms",
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    refreshAuthToken
  );
};

interface DeleteRoomRequestParams {
  roomId: string;
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const deleteRoomRequest = async ({
  roomId,
  authToken,
  username,
  refreshAuthToken,
}: DeleteRoomRequestParams): Promise<Response> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    `/api/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
      headers,
    },
    refreshAuthToken
  );
};
