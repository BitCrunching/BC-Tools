#!/bin/sh
# Builds the Comprio stress-test files into <repo>/test-assets/ (untracked).
# Needs a sample.mov and an iphone.mov (any short clips) in that folder first.
# Usage: sh tools/comprio-stress/make-assets.sh
set -e
cd "$(dirname "$0")/../.."
mkdir -p test-assets && cd test-assets
[ -f sample.mov ] && [ -f iphone.mov ] || { echo "Put a short sample.mov and iphone.mov in test-assets/ first"; exit 1; }
swiftc -O ../tools/comprio-stress/genvideo.swift -o genvideo
./genvideo small-1080p.mov 1920 1080 5 20
./genvideo huge-4k-60s.mov 3840 2160 60 120      # ~900 MB, takes a few minutes
./genvideo large-1080p-120s.mov 1920 1080 120 40 # ~600 MB
: > zero-byte.mp4
head -c 2000000 /dev/urandom > random-garbage.mp4
echo "this is not a video, just a text file renamed to .mov" > text-file.mov
SZ=$(stat -f%z iphone.mov); head -c $((SZ*4/10)) iphone.mov > truncated.mov
python3 - <<'PY'
import random
random.seed(7)
d=bytearray(open('iphone.mov','rb').read()); d[0:64]=b'\0'*64; open('header-zeroed.mov','wb').write(d)
m=bytearray(open('sample.mov','rb').read())
for _ in range(400):
    i=random.randrange(len(m)//3, len(m)*2//3); m[i]=random.randrange(256)
open('corrupt-middle.mov','wb').write(m)
junk=lambda n: bytes(random.randrange(256) for _ in range(n))
for name,head in [('fake-raw.cr2',b'II*\x00'),('fake-raw.nef',b'MM\x00*'),('fake-raw.dng',b'II*\x00'),('fake-raw.arw',b'II*\x00'),('fake-camera.braw',b'braw'),('fake-red.r3d',b'RED2'),('fake-old.avi',b'RIFF\x00\x10\x00\x00AVI LIST'),('fake-old.wmv',bytes.fromhex('3026b2758e66cf11a6d900aa0062ce6c')),('fake-old.flv',b'FLV\x01\x05\x00\x00\x00\x09'),('audio-only-ish.mp3',b'ID3')]:
    open(name,'wb').write(head+junk(300000))
PY
echo "assets ready in test-assets/"
