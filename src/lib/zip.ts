const CRC_TABLE = new Uint32Array(256);

for (let i = 0; i < CRC_TABLE.length; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[i] = value >>> 0;
}

export type ZipEntry = {
  path: string;
  data: Buffer | Uint8Array | string;
};

export function createZip(entries: ZipEntry[]): Buffer {
  const files: Array<{
    name: Buffer;
    data: Buffer;
    crc: number;
    offset: number;
    localHeader: Buffer;
  }> = [];

  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path.replace(/^\/+/, ""), "utf8");
    const data =
      typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const crc = crc32(data);
    const localHeader = buildLocalHeader(name, data.length, crc);
    files.push({ name, data, crc, offset, localHeader });
    offset += localHeader.length + data.length;
  }

  const central = files.map((file) => buildCentralHeader(file));
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  const end = buildEndRecord(files.length, centralSize, offset);

  return Buffer.concat([
    ...files.flatMap((file) => [file.localHeader, file.data]),
    ...central,
    end,
  ]);
}

function buildLocalHeader(name: Buffer, size: number, crc: number): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
}

function buildCentralHeader(file: {
  name: Buffer;
  data: Buffer;
  crc: number;
  offset: number;
}): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(file.crc, 16);
  header.writeUInt32LE(file.data.length, 20);
  header.writeUInt32LE(file.data.length, 24);
  header.writeUInt16LE(file.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(file.offset, 42);
  return Buffer.concat([header, file.name]);
}

function buildEndRecord(entryCount: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
