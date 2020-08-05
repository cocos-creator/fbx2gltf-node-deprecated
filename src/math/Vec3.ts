import { EPSILON } from './epsilon';

export class Vec3 {
    public declare x: number;
    public declare y: number;
    public declare z: number;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

export namespace Vec3 {
    export function clone(v: Vec3) {
        return new Vec3(v.x, v.y, v.z);
    }

    export function copy(out: Vec3, v: Vec3) {
        out.x = v.x;
        out.y = v.y;
        out.z = v.z;
    }

    export function isEqual(lhs: Vec3, rhs: Vec3, epsilon = EPSILON) {
        return (Math.abs(lhs.x - rhs.x) < epsilon)  &&
            (Math.abs(lhs.y - rhs.y) < epsilon)  &&
            (Math.abs(lhs.z - rhs.z) < epsilon);
    }
}