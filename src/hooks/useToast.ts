import { toast as sonnerToast } from "sonner";
import {
  getNativeToastOptions,
  showNativeToastNotification,
} from "@/utils/nativeToastNotifications";

type SonnerToast = typeof sonnerToast;
type SonnerToastMessage = Parameters<SonnerToast>[0];
type SonnerToastOptions = Parameters<SonnerToast>[1];

const callableToast = ((
  message: SonnerToastMessage,
  options?: SonnerToastOptions
) => {
  void showNativeToastNotification(
    "basic",
    message,
    getNativeToastOptions(options)
  );
  return sonnerToast(message, options);
}) as SonnerToast;

export const toast = new Proxy(callableToast, {
  get(_target, property, receiver) {
    return Reflect.get(sonnerToast, property, receiver);
  },
}) as SonnerToast;