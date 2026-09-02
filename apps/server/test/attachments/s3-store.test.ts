import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { InvalidObjectKeyError, ObjectNotFoundError } from '../../src/attachments/object-store.js';
import { S3ObjectStore } from '../../src/attachments/s3-store.js';

const s3Mock = mockClient(S3Client);

function makeStore(): S3ObjectStore {
  return new S3ObjectStore(
    { region: 'ap-south-1', bucket: 'gisik-attachments', accessKeyId: 'k', secretAccessKey: 's' },
    new S3Client({ region: 'ap-south-1' }),
  );
}

beforeEach(() => {
  s3Mock.reset();
});

describe('S3ObjectStore', () => {
  it('put uploads with bucket, key, content type and length', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const bytes = Buffer.from('pdf bytes here');
    await makeStore().put('w/ws1/a/att1', Readable.from(bytes), { mime: 'application/pdf', size: bytes.length });
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const input = calls[0]!.args[0].input;
    expect(input.Bucket).toBe('gisik-attachments');
    expect(input.Key).toBe('w/ws1/a/att1');
    expect(input.ContentType).toBe('application/pdf');
    expect(input.ContentLength).toBe(bytes.length);
  });

  it('getStream returns the body stream', async () => {
    const bytes = Buffer.from('image bytes');
    s3Mock.on(GetObjectCommand).resolves({ Body: Readable.from(bytes) as never });
    const stream = await makeStore().getStream('w/ws1/a/att1');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    expect(s3Mock.commandCalls(GetObjectCommand)[0]!.args[0].input.Key).toBe('w/ws1/a/att1');
  });

  it('a NoSuchKey answer becomes ObjectNotFoundError', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }));
    await expect(makeStore().getStream('w/ws1/a/gone')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it('other S3 failures propagate untranslated', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(makeStore().getStream('w/ws1/a/x')).rejects.toThrow('denied');
  });

  it('delete sends DeleteObject', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    await makeStore().delete('w/ws1/a/att1');
    expect(s3Mock.commandCalls(DeleteObjectCommand)[0]!.args[0].input.Key).toBe('w/ws1/a/att1');
  });

  it('defaults path-style addressing to true when the config omits it', () => {
    // No client override and no forcePathStyle key: the only shape that
    // reaches the constructor's `config.forcePathStyle ?? true`. The SDK's
    // own default is false (confirmed by inspecting a bare S3Client's
    // resolved config), so `toBe(true)` here constrains this class's
    // explicit choice, not an SDK default riding along for free.
    const store = new S3ObjectStore({
      region: 'ap-south-1',
      bucket: 'gisik-attachments',
      accessKeyId: 'k',
      secretAccessKey: 's',
    });
    expect((store as unknown as { client: S3Client }).client.config.forcePathStyle).toBe(true);
  });

  it('planted defect: malformed keys are refused before any network call', async () => {
    // All three verbs share the same `assertValidObjectKey` call (object-store.ts) —
    // each is asserted independently so a mutation dropping the check from any
    // one of put/getStream/delete reddens this test at its own site, not just
    // wherever the check happens to still be armed.
    await expect(makeStore().getStream('../escape')).rejects.toBeInstanceOf(InvalidObjectKeyError);
    await expect(
      makeStore().put('../escape', Readable.from(Buffer.from('x')), { mime: 'text/plain', size: 1 }),
    ).rejects.toBeInstanceOf(InvalidObjectKeyError);
    await expect(makeStore().delete('../escape')).rejects.toBeInstanceOf(InvalidObjectKeyError);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });
});
