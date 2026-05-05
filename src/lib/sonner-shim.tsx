import type { ReactNode } from "react";
import * as Real from "sonner-original";
import type { ExternalToast } from "sonner-original";
import { mirrorToastToInbox, toastMessageToString } from "@/lib/inbox/mirrorToastToInbox";

function wrap<T extends ReactNode>(
  method: string,
  fn: (message: T, data?: ExternalToast) => string | number
): (message: T, data?: ExternalToast) => string | number {
  return (message: T, data?: ExternalToast) => {
    const id = fn(message, data);
    const text = toastMessageToString(message);
    if (text !== null) {
      mirrorToastToInbox({
        method,
        message: text,
        data,
        toastId: id,
      });
    }
    return id;
  };
}

const baseToast = Real.toast as (message: ReactNode, data?: ExternalToast) => string | number;

export const toast = Object.assign(wrap("toast", baseToast), {
  success: wrap("success", Real.toast.success),
  info: wrap("info", Real.toast.info),
  warning: wrap("warning", Real.toast.warning),
  error: wrap("error", Real.toast.error),
  message: wrap("message", Real.toast.message),
  loading: wrap("loading", Real.toast.loading),
  custom: Real.toast.custom,
  promise: Real.toast.promise,
  dismiss: Real.toast.dismiss,
  getHistory: Real.toast.getHistory,
  getToasts: Real.toast.getToasts,
}) as typeof Real.toast;

export { Toaster } from "sonner-original";
export type { ExternalToast, ToasterProps, ToastT } from "sonner-original";
