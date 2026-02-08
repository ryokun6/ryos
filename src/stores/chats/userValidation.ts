export const CHAT_USERNAME_PATTERN =
  /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;
export const CHAT_PASSWORD_MIN_LENGTH = 8;

interface ValidateCreateUserInputParams {
  username: string;
  password: string;
}

export const validateCreateUserInput = ({
  username,
  password,
}: ValidateCreateUserInputParams): string | null => {
  if (!username) {
    return "Username cannot be empty";
  }

  if (!CHAT_USERNAME_PATTERN.test(username)) {
    return "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols";
  }

  if (!password || password.trim().length === 0) {
    return "Password is required";
  }
  if (password.length < CHAT_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${CHAT_PASSWORD_MIN_LENGTH} characters`;
  }

  return null;
};
