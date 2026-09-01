/**
 * Collects positional SQL parameters. Every fragment builder in the read
 * layer takes one of these and interpolates ONLY the `$n` placeholders it
 * returns — user bytes never enter SQL text.
 *
 * The class exists so that "bind, don't concatenate" is the path of least
 * resistance rather than a rule a reviewer has to remember: a fragment
 * builder that wants a value in its SQL has nothing to reach for except
 * `add()`, and `add()` can only ever produce `$n`.
 *
 * `toArray()` hands back a COPY. A caller that pushed onto the live array
 * would shift every later placeholder by one — the values and the `$n`s
 * would silently address different things, which is the one way this class
 * could produce a wrong query without producing an error.
 */
export class SqlParams {
  private readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  toArray(): unknown[] {
    return [...this.values];
  }
}
