import type { Role } from "../../client";
import { ConstrainedString } from "./common";

export const Username = ConstrainedString("*.!@$%^&(){}[]:;<>,.?/~_+-=|\\", 4, 31);
export const Password = ConstrainedString("*.!@$%^&(){}[]:;<>,.?/~_+-=|\\", 4, 31);

export const ALL_ROLES: readonly Role[] = [
    "admin",
    "data-manager",
    "project-manager",
    "supervisor",
    "annotator",
];
