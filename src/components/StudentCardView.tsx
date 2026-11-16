// The digital student card, reproducing the official design. Everything is laid
// out in "design units" (pixels of the official card's reference render,
// 1828×1125 inside a 20-unit black frame) and scaled to the requested width.
import { Image, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { barcodeValue, yearLabel, type StudentCard } from '../lib/studentCard';
import { AvignonLogo } from './AvignonLogo';
import { Barcode } from './Barcode';
import { Icon } from './Icon';

const INNER_W = 1828;
const INNER_H = 1125;
const FRAME = 20;
const OUTER_W = INNER_W + 2 * FRAME;
const OUTER_H = INNER_H + 2 * FRAME;
/** Width / height of the whole card, frame included. */
export const STUDENT_CARD_RATIO = OUTER_W / OUTER_H;

const BRAND_RED = '#e85245';
const INK = '#050505';
/** Extra on-screen size (px) added to every text, on top of the scaled design size. */
const TEXT_BUMP = 1.5;

export function StudentCardView({ card, width }: { card: StudentCard; width: number }) {
  const s = width / OUTER_W;
  const u = (n: number) => n * s;
  const fs = (size: number, bump = TEXT_BUMP) => u(size) + bump;
  const text = (size: number, weight: TextStyle['fontWeight'] = '400', color = INK, bump = TEXT_BUMP): TextStyle => ({
    position: 'absolute',
    fontSize: fs(size, bump),
    lineHeight: fs(size, bump) * 1.25,
    fontWeight: weight,
    color,
  });
  const at = (left: number, top: number) => ({ left: u(left), top: u(top) });

  return (
    <View
      style={[styles.outer, { width, height: u(OUTER_H), borderRadius: u(84), padding: u(FRAME) }]}
      accessible
      accessibilityLabel={`Carte étudiant de ${card.firstName} ${card.lastName}, numéro ${card.number}`}
    >
      <View style={[styles.inner, { borderRadius: u(64) }]}>
        <View style={[styles.abs, at(1321, 46)]}>
          <AvignonLogo height={u(94)} />
        </View>

        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[text(54, '700'), at(533, 262), { maxWidth: u(760) }]}
        >
          {card.lastName} {card.firstName}
        </Text>
        <Text allowFontScaling={false} style={[text(54, '700'), at(533, 360), { letterSpacing: u(2) }]}>
          n° AU : {card.number}
        </Text>
        <Text allowFontScaling={false} style={[text(50, '400', '#111'), styles.semiBold, at(533, 446)]}>
          I.N.E : {card.ine.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={[text(50, '400', '#111'), styles.semiBold, at(533, 522)]}>
          Né(e) le : {card.birthDate}
        </Text>

        <View style={[styles.abs, styles.photo, at(1321, 265), { width: u(440), height: u(571) }]}>
          {card.photoUri ? (
            <Image source={{ uri: card.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Icon name="user-line" size={u(200)} color="#b5b5b5" />
          )}
        </View>

        <View style={[styles.abs, at(122, 701)]}>
          <Barcode value={barcodeValue(card)} width={u(771)} height={u(252)} />
        </View>
        <Text allowFontScaling={false} style={[text(30, '400', '#333'), at(46, 978), { letterSpacing: u(1.5) }]}>
          {barcodeValue(card)}
        </Text>
        {/* One Text per line, kept clear of the banner's slanted edge (shrinks if it would touch it). */}
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[text(22, '400', '#444', 1), at(46, 1040), { width: u(550) }]}
        >
          {"L'apprenant doit toujours être porteur de cette"}
        </Text>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[text(22, '400', '#444', 1), at(46, 1080), { width: u(510) }]}
        >
          {"carte dans l'enceinte de l'université"}
        </Text>

        <Svg style={styles.abs} width={u(INNER_W)} height={u(INNER_H)} viewBox={`0 0 ${INNER_W} ${INNER_H}`}>
          <Polygon points={`640,1025 ${INNER_W},1025 ${INNER_W},${INNER_H} 540,${INNER_H}`} fill={BRAND_RED} />
        </Svg>
        <View style={[styles.abs, styles.bannerRow, at(640, 1025), { width: u(1086), height: u(100), gap: u(36) }]}>
          <Text allowFontScaling={false} style={[styles.bannerText, { fontSize: fs(34) }]}>Carte étudiant</Text>
          <Text allowFontScaling={false} style={[styles.bannerText, { fontSize: fs(34) }]}>·</Text>
          <Text allowFontScaling={false} style={[styles.bannerText, { fontSize: fs(34), letterSpacing: u(1) }]}>
            {yearLabel(card)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: '#000',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
  },
  inner: { flex: 1, backgroundColor: '#fff', overflow: 'hidden' },
  abs: { position: 'absolute', left: 0, top: 0 },
  photo: { backgroundColor: '#dfdfdf', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bannerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // About half a weight step above regular: RN only has 100-steps (and iOS ignores e.g. '450'),
  // so thicken the strokes with a hard same-colour shadow instead.
  semiBold: { textShadowColor: '#111', textShadowOffset: { width: 0.3, height: 0 }, textShadowRadius: 0.1 },
  bannerText: { color: '#fff', fontWeight: '700' },
});
