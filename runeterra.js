(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.runeterra = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
class Base32 {
  static numberOfTrailingZeros (i) {
    if (i === 0) return 32
    let n = 31
    let y = i << 16
    if (y !== 0) {
      n = n - 16
      i = y
    }
    y = i << 8
    if (y !== 0) {
      n = n - 8
      i = y
    }
    y = i << 4
    if (y !== 0) {
      n = n - 4
      i = y
    }
    y = i << 2
    if (y !== 0) {
      n = n - 2
      i = y
    }
    return n - ((i << 1) >> 31)
  }

  static decode (encoded) {
    encoded = encoded.trim().replace(Base32.SEPARATOR, '')
    encoded = encoded.replace(/[=]*$/, '')
    encoded = encoded.toUpperCase()

    if (encoded.length === 0) return [0]
    const encodedLength = encoded.length
    const outLength = Math.floor(encodedLength * Base32.SHIFT / 8)
    const result = new Array(outLength)
    let buffer = 0
    let next = 0
    let bitsLeft = 0
    for (const c of encoded.split('')) {
      if (typeof Base32.CHAR_MAP[c] === 'undefined') {
        throw new TypeError('Illegal character: ' + c)
      }

      buffer <<= Base32.SHIFT
      buffer |= Base32.CHAR_MAP[c] & Base32.MASK
      bitsLeft += Base32.SHIFT
      if (bitsLeft >= 8) {
        result[next++] = (buffer >> (bitsLeft - 8)) & 0xff
        bitsLeft -= 8
      }
    }

    return result
  }

  static encode (data, padOutput = false) {
    if (data.length === 0) return ''
    if (data.length >= (1 << 28)) throw new RangeError('Array is too long for this')

    const outputLength = Math.floor((data.length * 8 + Base32.SHIFT - 1) / Base32.SHIFT)
    const result = new Array(outputLength)

    let buffer = data[0]
    let next = 1
    let bitsLeft = 8
    while (bitsLeft > 0 || next < data.length) {
      if (bitsLeft < Base32.SHIFT) {
        if (next < data.length) {
          buffer <<= 8
          buffer |= (data[next++] & 0xff)
          bitsLeft += 8
        } else {
          const pad = Base32.SHIFT - bitsLeft
          buffer <<= pad
          bitsLeft += pad
        }
      }
      const index = Base32.MASK & (buffer >> (bitsLeft - Base32.SHIFT))
      bitsLeft -= Base32.SHIFT
      result.push(Base32.DIGITS[index])
    }
    if (padOutput) {
      const padding = 8 - (result.length % 8)
      if (padding > 0) result.push('='.repeat(padding === 8 ? 0 : padding))
    }
    return result.join('')
  }
}

Base32.DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')
Base32.MASK = Base32.DIGITS.length - 1
Base32.SHIFT = Base32.numberOfTrailingZeros(Base32.DIGITS.length)
Base32.CHAR_MAP = Base32.DIGITS.reduce((m, d, i) => {
  m[d.toString()] = i
  return m
}, {})
Base32.SEPARATOR = '-'

module.exports = Base32

},{}],2:[function(require,module,exports){
const Faction = require('./Faction')

module.exports = class Card {
  constructor (cardCode, count) {
    this.code = cardCode
    this.count = count
  }

  static from (setString, factionString, numberString, count) {
    return new this(setString + factionString + numberString, count)
  }

  static fromCardString (cardString) {
    const [count, cardCode] = cardString.split(':')
    return new this(cardCode, parseInt(count))
  }

  get set () {
    return parseInt(this.code.substring(0, 2))
  }

  get faction () {
    return Faction.fromCode(this.code.substring(2, 4))
  }

  get id () {
    return parseInt(this.code.substring(4, 7))
  }

  get version () {
    return Faction.getVersion(this.code.substring(2, 4))
  }
}

},{"./Faction":4}],3:[function(require,module,exports){
const Base32 = require('./Base32')
const VarInt = require('./VarInt')
const Card = require('./Card')
const Faction = require('./Faction')

class DeckEncoder {
  static decode (code) {
    const result = []

    let bytes = null
    try {
      bytes = Base32.decode(code)
    } catch (e) {
      throw new TypeError('Invalid deck code')
    }

    const firstByte = bytes.shift()
    const format = firstByte >> 4
    const version = firstByte & 0xF

    if (format !== DeckEncoder.FORMAT) {
      throw new TypeError('The provided code does not match the required format.')
    }
    if (version > DeckEncoder.MAX_KNOWN_VERSION) {
      throw new TypeError('The provided code requires a higher version of this library; please update.')
    }

    for (let i = 3; i > 0; i--) {
      const numGroupOfs = VarInt.pop(bytes)

      for (let j = 0; j < numGroupOfs; j++) {
        const numOfsInThisGroup = VarInt.pop(bytes)
        const set = VarInt.pop(bytes)
        const faction = VarInt.pop(bytes)

        for (let k = 0; k < numOfsInThisGroup; k++) {
          const card = VarInt.pop(bytes)

          const setString = set.toString().padStart(2, '0')
          const factionString = Faction.fromID(faction).shortCode
          const cardString = card.toString().padStart(3, '0')

          result.push(Card.from(setString, factionString, cardString, i))
        }
      }
    }

    while (bytes.length > 0) {
      const fourPlusCount = VarInt.pop(bytes)
      const fourPlusSet = VarInt.pop(bytes)
      const fourPlusFaction = VarInt.pop(bytes)
      const fourPlusNumber = VarInt.pop(bytes)

      const fourPlusSetString = fourPlusSet.toString().padStart(2, '0')
      const fourPlusFactionString = Faction.fromID(fourPlusFaction).shortCode
      const fourPlusNumberString = fourPlusNumber.toString().padStart(3, '0')

      result.push(Card.from(fourPlusSetString, fourPlusFactionString, fourPlusNumberString, fourPlusCount))
    }

    return result
  }

  static encode (cards) {
    if (!this.isValidDeck(cards)) {
      throw new TypeError('The deck provided contains invalid card codes')
    }

    const grouped3 = this.groupByFactionAndSetSorted(cards.filter(c => c.count === 3))
    const grouped2 = this.groupByFactionAndSetSorted(cards.filter(c => c.count === 2))
    const grouped1 = this.groupByFactionAndSetSorted(cards.filter(c => c.count === 1))
    const nOfs = cards.filter(c => c.count > 3)

    return Base32.encode([
      DeckEncoder.FORMAT << 4 | cards.reduce((p, c) => Math.max(p, c.version), 0) & 0xF,
      ...this.encodeGroup(grouped3),
      ...this.encodeGroup(grouped2),
      ...this.encodeGroup(grouped1),
      ...this.encodeNofs(nOfs)
    ])
  }

  static encodeNofs (nOfs) {
    return nOfs
      .sort((a, b) => a.code.localeCompare(b.code))
      .reduce((result, card) => {
        result.push(...VarInt.get(card.count))
        result.push(...VarInt.get(card.set))
        result.push(...VarInt.get(card.faction.id))
        result.push(...VarInt.get(card.id))
        return result
      }, [])
  }

  static encodeGroup (group) {
    return group.reduce((result, list) => {
      result.push(...VarInt.get(list.length))

      const first = list[0]
      result.push(...VarInt.get(first.set))
      result.push(...VarInt.get(first.faction.id))

      for (const card of list) {
        result.push(...VarInt.get(card.id))
      }

      return result
    }, VarInt.get(group.length))
  }

  static isValidDeck (cards) {
    return cards.every(card => (
      card.code.length === 7 &&
      !isNaN(card.id) &&
      !isNaN(card.count) &&
      card.faction &&
      card.count > 0
    ))
  }

  static groupByFactionAndSetSorted (cards) {
    const result = []

    while (cards.length > 0) {
      const set = []

      const first = cards.shift()
      set.push(first)

      for (let i = cards.length - 1; i >= 0; i--) {
        const compare = cards[i]
        if (first.set === compare.set && first.faction.id === compare.faction.id) {
          set.push(compare)
          cards.splice(i, 1)
        }
      }

      result.push(set)
    }

    return result.sort((a, b) => a.length - b.length).map(group => group.sort((a, b) => a.code.localeCompare(b.code)))
  }
}

DeckEncoder.MAX_KNOWN_VERSION = 5
DeckEncoder.FORMAT = 1
DeckEncoder.INITIAL_VERSION = 1

module.exports = DeckEncoder

},{"./Base32":1,"./Card":2,"./Faction":4,"./VarInt":5}],4:[function(require,module,exports){
class Faction {
  constructor (code, id) {
    this.shortCode = code
    this.id = id
  }

  static fromCode (code) {
    const [factionId] = Faction.FACTIONS[code] || []

    if (factionId === undefined) {
      throw new TypeError('Invalid faction code. It is possible you need to upgrade the runeterra package.')
    }

    return new this(code, factionId)
  }

  static fromID (id) {
    const [shortCode, [factionId]] = Object.entries(Faction.FACTIONS).find(([, [factionId]]) => factionId === id) || [undefined, []]

    if (factionId === undefined) {
      throw new TypeError('Invalid faction id. It is possible you need to upgrade the runeterra package.')
    }

    return new this(shortCode, factionId)
  }

  static getVersion (code) {
    const [, version] = Faction.FACTIONS[code] || []

    if (version === undefined) {
      throw new TypeError('Invalid faction code. It is possible you need to upgrade the runeterra package.')
    }

    return version
  }
}

Faction.FACTIONS = {
  DE: [0, 1],
  FR: [1, 1],
  IO: [2, 1],
  NX: [3, 1],
  PZ: [4, 1],
  SI: [5, 1],
  BW: [6, 2],
  MT: [9, 2],
  SH: [7, 3],
  BC: [10, 4],
  RU: [12, 5]
}

module.exports = Faction

},{}],5:[function(require,module,exports){
class VarInt {
  static pop (bytes) {
    let result = 0
    let currentShift = 0
    let bytesPopped = 0
    for (let i = 0; i < bytes.length; i++) {
      bytesPopped++
      const current = bytes[i] & VarInt.AllButMSB
      result |= current << currentShift

      if ((bytes[i] & VarInt.JustMSB) !== VarInt.JustMSB) {
        bytes.splice(0, bytesPopped)
        return result
      }

      currentShift += 7
    }

    throw new TypeError('Byte array did not contain valid varints.')
  }

  static get (value) {
    const buff = new Array(10)
    buff.fill(0)

    let currentIndex = 0
    if (value === 0) return [0]

    while (value !== 0) {
      let byteVal = value & VarInt.AllButMSB
      value >>>= 7

      if (value !== 0) byteVal |= VarInt.JustMSB
      buff[currentIndex++] = byteVal
    }

    return buff.slice(0, currentIndex)
  }
}

VarInt.AllButMSB = 0x7f
VarInt.JustMSB = 0x80

module.exports = VarInt

},{}],6:[function(require,module,exports){
module.exports = {
  DeckEncoder: require('./DeckEncoder'),
  Card: require('./Card'),
  Faction: require('./Faction')
}

},{"./Card":2,"./DeckEncoder":3,"./Faction":4}]},{},[6])(6)
});
