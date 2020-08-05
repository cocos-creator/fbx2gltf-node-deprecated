import { EPSILON } from './epsilon';


export class Quat {
    public declare x: number;
    public declare y: number;
    public declare z: number;
    public declare w: number;

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
}

export namespace Quat {
    export function clone(v: Quat) {
        return new Quat(v.x, v.y, v.z, v.w);
    }

    export function copy(out: Quat, v: Quat) {
        out.x = v.x;
        out.y = v.y;
        out.z = v.z;
        out.w = v.w;
    }

    export function isEqual(lhs: Quat, rhs: Quat, epsilon = EPSILON) {
        return (Math.abs(lhs.x - rhs.x) < epsilon)  &&
            (Math.abs(lhs.y - rhs.y) < epsilon)  &&
            (Math.abs(lhs.z - rhs.z) < epsilon) &&
            (Math.abs(lhs.w - rhs.w) < epsilon);
    }

    export function magnitude(quat: Quat) {
        return Math.sqrt(magnitudeSqr(quat));
    }

    export function magnitudeSqr(quat: Quat) {
        return quat.x * quat.x + quat.y * quat.y + quat.z * quat.z + quat.w * quat.w;
    }

    export function normalize(out: Quat, quat: Quat) {
        const mag = Quat.magnitude(quat);
        out.x = quat.x / mag;
        out.y = quat.y / mag;
        out.z = quat.z / mag;
        out.w = quat.w / mag;
    }

    export function slerp(out: Quat, from: Quat, to: Quat, t: number) {
        let scale0 = 0;
        let scale1 = 0;
        let bx = to.x;
        let by = to.y;
        let bz = to.z;
        let bw = to.w;

        // calc cosine
        let cosOmega = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;
        // adjust signs (if necessary)
        if (cosOmega < 0.0) {
            cosOmega = -cosOmega;
            bx = -bx;
            by = -by;
            bz = -bz;
            bw = -bw;
        }
        // calculate coefficients
        if ((1.0 - cosOmega) > 0.000001) {
            // standard case (slerp)
            const omega = Math.acos(cosOmega);
            const sinOmega = Math.sin(omega);
            scale0 = Math.sin((1.0 - t) * omega) / sinOmega;
            scale1 = Math.sin(t * omega) / sinOmega;
        } else {
            // "from" and "to" quaternions are very close
            //  ... so we can do a linear interpolation
            scale0 = 1.0 - t;
            scale1 = t;
        }
        // calculate final values
        out.x = scale0 * from.x + scale1 * bx;
        out.y = scale0 * from.y + scale1 * by;
        out.z = scale0 * from.z + scale1 * bz;
        out.w = scale0 * from.w + scale1 * bw;
        return out;
    }
}
