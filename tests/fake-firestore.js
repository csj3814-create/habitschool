// 서버 함수 테스트용 아주 작은 메모리 Firestore.
// 쓰는 기능만 흉내 낸다: doc/collection, get/set(merge)/delete, where('==' / '!='),
// count(), runTransaction, FieldValue.increment/serverTimestamp/delete.
// 어떤 컬렉션을 건드렸는지 `touched` 에 남긴다 — "이 흐름은 저 컬렉션을 읽지 않는다" 를 확인할 때 쓴다.

const INCREMENT = Symbol('increment');
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE = Symbol('delete');

export const FakeFieldValue = {
    increment: (amount) => ({ [INCREMENT]: Number(amount) || 0 }),
    serverTimestamp: () => ({ [SERVER_TIMESTAMP]: true }),
    delete: () => ({ [DELETE]: true }),
};

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function resolveValue(current, next, now) {
    if (isPlainObject(next) && INCREMENT in next) return (Number(current) || 0) + next[INCREMENT];
    if (isPlainObject(next) && SERVER_TIMESTAMP in next) return new Date(now);
    return next;
}

function applyWrite(current, next, merge, now) {
    const base = merge && isPlainObject(current) ? { ...current } : {};
    for (const [key, value] of Object.entries(next)) {
        if (isPlainObject(value) && DELETE in value) {
            delete base[key];
        } else if (merge && isPlainObject(value) && !(INCREMENT in value) && !(SERVER_TIMESTAMP in value)) {
            base[key] = applyWrite(base[key], value, true, now);
        } else {
            base[key] = resolveValue(base[key], value, now);
        }
    }
    return base;
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export function createFakeFirestore(initial = {}) {
    const store = new Map(Object.entries(initial).map(([path, data]) => [path, clone(data)]));
    const touched = new Set();
    let now = Date.parse('2026-10-16T12:00:00Z');

    const snapshotOf = (path) => {
        const data = store.get(path);
        return {
            id: path.split('/').pop(),
            ref: docRef(path),
            exists: data !== undefined,
            data: () => clone(data),
        };
    };

    function docRef(path) {
        const collectionName = path.split('/')[0];
        return {
            id: path.split('/').pop(),
            path,
            async get() {
                touched.add(collectionName);
                return snapshotOf(path);
            },
            async set(data, options = {}) {
                touched.add(collectionName);
                store.set(path, applyWrite(store.get(path), data, options.merge === true, now));
            },
            async delete() {
                touched.add(collectionName);
                store.delete(path);
            },
        };
    }

    function query(name, filters = []) {
        const matches = () => [...store.keys()]
            .filter((path) => path.split('/').length === 2 && path.startsWith(`${name}/`))
            .filter((path) => filters.every(({ field, op, value }) => {
                const data = store.get(path) || {};
                if (op === '==') return data[field] === value;
                if (op === '!=') return field in data && data[field] !== value;
                throw new Error(`fake firestore: unsupported op ${op}`);
            }));
        return {
            where(field, op, value) {
                return query(name, [...filters, { field, op, value }]);
            },
            orderBy() { return this; },
            limit() { return this; },
            doc(id) { return docRef(`${name}/${id}`); },
            count() {
                return {
                    async get() {
                        touched.add(name);
                        const count = matches().length;
                        return { data: () => ({ count }) };
                    },
                };
            },
            async get() {
                touched.add(name);
                const docs = matches().map(snapshotOf);
                return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
            },
        };
    }

    const db = {
        collection: (name) => query(name),
        doc: (path) => docRef(path),
        async runTransaction(fn) {
            // 실제처럼 읽기를 모두 끝낸 뒤 쓰기를 한꺼번에 반영한다.
            const writes = [];
            const tx = {
                get: (ref) => ref.get(),
                set: (ref, data, options) => { writes.push(() => ref.set(data, options)); },
                delete: (ref) => { writes.push(() => ref.delete()); },
            };
            const result = await fn(tx);
            for (const write of writes) await write();
            return result;
        },
    };

    return {
        db,
        touched,
        read: (path) => clone(store.get(path)),
        paths: () => [...store.keys()],
        setNow: (ms) => { now = ms; },
    };
}

export class FakeHttpsError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
