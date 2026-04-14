#!/usr/bin/env python3
"""Generate PNG icons for LGTM Inspector extension variants."""
import struct
import zlib
import os

def make_chunk(chunk_type, data):
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + chunk_type + data + struct.pack('>I', crc)

def create_png(size, bg_color=(59, 130, 246), fg_color=(255, 255, 255)):
    """Create a solid background PNG with a simple checkmark-like mark."""
    r, g, b = bg_color
    fr, fg_c, fb = fg_color

    raw = b''
    for y in range(size):
        raw += b'\x00'  # filter: None
        for x in range(size):
            margin = max(1, size // 8)
            in_bg = (margin <= x < size - margin) and (margin <= y < size - margin)

            cx, cy = size // 2, size // 2
            dist = abs(x - cx) + abs(y - cy)
            in_mark = in_bg and dist < size // 4

            if in_mark:
                raw += struct.pack('BBB', fr, fg_c, fb)
            elif in_bg:
                raw += struct.pack('BBB', r, g, b)
            else:
                dr, dg, db = max(0, r - 30), max(0, g - 30), max(0, b - 30)
                raw += struct.pack('BBB', dr, dg, db)

    compressed = zlib.compress(raw, 9)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = make_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    idat = make_chunk(b'IDAT', compressed)
    iend = make_chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def main():
    # lgtm variant: blue (#3b82f6)
    os.makedirs('icons', exist_ok=True)
    for size in [16, 32, 48, 128]:
        data = create_png(size, bg_color=(59, 130, 246))
        path = f'icons/icon{size}.png'
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  Created {path} ({size}x{size}) [blue/lgtm]')

    # standalone variant: green (#10b981)
    os.makedirs('icons-standalone', exist_ok=True)
    for size in [16, 32, 48, 128]:
        data = create_png(size, bg_color=(16, 185, 129))
        path = f'icons-standalone/icon{size}.png'
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  Created {path} ({size}x{size}) [green/standalone]')

if __name__ == '__main__':
    print('Generating icons...')
    main()
    print('Done.')
