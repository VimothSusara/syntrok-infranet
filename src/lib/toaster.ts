import { OverlayToaster, Position } from "@blueprintjs/core";

let toasterPromise: ReturnType<typeof OverlayToaster.create> | null = null;

function getToaster() {
    if (!toasterPromise) {
        toasterPromise = OverlayToaster.create({ position: Position.TOP });
    }
    return toasterPromise;
}

export async function showSuccess(message: string) {
    (await getToaster()).show({ message, intent: "success", icon: "tick-circle" });
}

export async function showError(message: string) {
    (await getToaster()).show({ message, intent: "danger", icon: "error" });
}
