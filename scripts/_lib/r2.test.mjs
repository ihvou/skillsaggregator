// node --test scripts/_lib/r2.test.mjs
//
// The two worked examples from AWS's "Signature Calculations in AWS Signature
// Version 4" for S3 (GET Object and PUT Object), with AWS's example credentials.
// If these match, R2 accepts the same signatures: it implements the S3 scheme.
import assert from "node:assert/strict";
import { test } from "node:test";
import { signRequest } from "./r2.mjs";

const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  date: new Date("2013-05-24T00:00:00Z"),
};

function signatureOf(headers) {
  return /Signature=([0-9a-f]{64})$/.exec(headers.authorization)?.[1];
}

test("GET Object example", () => {
  const headers = signRequest({
    ...credentials,
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    headers: { range: "bytes=0-9" },
  });
  assert.match(headers.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
  assert.equal(signatureOf(headers), "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  assert.equal(headers.host, undefined, "host is signed but left for fetch to set");
});

test("PUT Object example", () => {
  const headers = signRequest({
    ...credentials,
    method: "PUT",
    url: "https://examplebucket.s3.amazonaws.com/test$file.text",
    body: "Welcome to Amazon S3.",
    headers: {
      date: "Fri, 24 May 2013 00:00:00 GMT",
      "x-amz-storage-class": "REDUCED_REDUNDANCY",
    },
  });
  assert.equal(headers["x-amz-content-sha256"], "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
  assert.equal(signatureOf(headers), "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
});
