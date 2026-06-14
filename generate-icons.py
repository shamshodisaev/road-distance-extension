#!/usr/bin/env python3
"""Generates simple PNG icons for the Road Distance Calculator extension."""
import struct, zlib, os

def png(size, bg=(13, 110, 253), dot=(255, 255, 255)):
    r, g, b = bg
    dr, dg, db = dot

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))

    # Draw a car silhouette as a simple white dot in the centre
    cx = cy = size // 2
    radius = max(2, size // 5)
    rows = b''
    for y in range(size):
        row = b'\x00'
        for x in range(size):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist <= radius:
                row += bytes([dr, dg, db])
            else:
                row += bytes([r, g, b])
        rows += row

    idat = chunk(b'IDAT', zlib.compress(rows))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for s in (16, 48, 128):
    path = f'icons/icon{s}.png'
    with open(path, 'wb') as f:
        f.write(png(s))
    print(f'  {path}')

print('Done.')
