import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../application/home_cubit.dart';

/// Two hand-drawn dials: the completion ring and the week's adherence strip.
///
/// Hand-drawn — a [CustomPainter] each — rather than `fl_chart`, which the plan
/// named as the alternative and told us to avoid if we could (P3 Technical
/// Context). Between them these are about ninety lines of `Canvas` calls. The
/// package is 40-odd files of chart machinery for an arc and seven circles, it
/// brings its own animation and hit-testing model, and a chart library's idea of
/// a "pie" comes with a legend, a tooltip and a touch handler none of which
/// belong on a card the member reads in half a second. The rule of thumb that
/// applies: a dependency earns its place by doing something hard, and drawing a
/// circle is not hard.

/// Done of total, as an arc.
///
/// The number is drawn inside the ring rather than beside it, because the ring
/// on its own is a proportion and the member wants the count: "three of five"
/// is the fact, and the arc is what makes it readable without counting.
class CompletionRing extends StatelessWidget {
  const CompletionRing({
    super.key,
    required this.done,
    required this.total,
    this.diameter = 56,
  });

  final int done;
  final int total;
  final double diameter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      // The count in words, so the ring is not a mystery to a screen reader.
      // Without this the arc is an unlabelled box and the only thing announced
      // is the "3/5" glyph, which reads as a fraction rather than as progress.
      label: AppLocalizations.of(context).homeDoneOfTotal(done, total),
      child: CustomPaint(
        size: Size.square(diameter),
        painter: _RingPainter(
          // `total == 0` is a real state — a day with training and no tasks —
          // and dividing by it would paint a NaN arc, which on some backends
          // is a blank card rather than an exception anybody sees.
          fraction: total == 0 ? 0 : done / total,
          track: scheme.surfaceContainerHighest,
          fill: scheme.primary,
        ),
        child: SizedBox.square(
          dimension: diameter,
          child: Center(
            child: Text(
              '$done/$total',
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({
    required this.fraction,
    required this.track,
    required this.fill,
  });

  final double fraction;
  final Color track;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 6.0;
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height - stroke,
    );

    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = track;
    canvas.drawArc(rect, 0, math.pi * 2, false, base);

    if (fraction <= 0) return;

    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      // Rounded, so a single completed task out of twelve is a visible mark
      // rather than a hairline nobody notices.
      ..strokeCap = StrokeCap.round
      ..color = fill;
    canvas.drawArc(
      rect,
      // From the top, clockwise. `-pi/2` and not `0`: an arc starting at three
      // o'clock reads as a gauge rather than as progress.
      -math.pi / 2,
      math.pi * 2 * fraction.clamp(0.0, 1.0),
      false,
      arc,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction || old.fill != fill || old.track != track;
}

/// The week's adherence, as seven dots — oldest on the left, today on the right.
///
/// Three states and three *shapes*, not three colours: a filled disc for a day
/// followed, a hollow disc struck through for a day missed, and a thin hollow
/// disc for a day nobody answered. Colour alone would make the strip unreadable
/// to about one man in twelve, and it would also make the important distinction
/// — missed against unanswered — the one that vanishes.
class AdherenceStrip extends StatelessWidget {
  const AdherenceStrip({super.key, required this.week, this.dotSize = 14});

  final List<AdherenceDay> week;
  final double dotSize;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Semantics(
      // Every day named, in order, with its state. The whole strip is one
      // canvas, so this is the only thing a screen reader can be told — and a
      // strip that announces nothing is a widget that does not exist for
      // somebody using one.
      label: [
        for (final day in week)
          '${day.date}: ${switch (day.adherence) {
            Adherence.adhered => t.homeAdhered,
            Adherence.missed => t.homeMissed,
            Adherence.unanswered => t.homeUnanswered,
          }}',
      ].join(', '),
      child: CustomPaint(
        size: Size(
          week.length * dotSize * 1.7,
          dotSize + 4,
        ),
        painter: _StripPainter(
          week: week,
          dotSize: dotSize,
          adhered: scheme.primary,
          missed: scheme.error,
          unanswered: scheme.outlineVariant,
        ),
      ),
    );
  }
}

class _StripPainter extends CustomPainter {
  const _StripPainter({
    required this.week,
    required this.dotSize,
    required this.adhered,
    required this.missed,
    required this.unanswered,
  });

  final List<AdherenceDay> week;
  final double dotSize;
  final Color adhered;
  final Color missed;
  final Color unanswered;

  @override
  void paint(Canvas canvas, Size size) {
    if (week.isEmpty) return;

    final radius = dotSize / 2;
    final step = size.width / week.length;
    final centreY = size.height / 2;

    for (var i = 0; i < week.length; i++) {
      final centre = Offset(step * i + step / 2, centreY);

      switch (week[i].adherence) {
        case Adherence.adhered:
          canvas.drawCircle(
            centre,
            radius,
            Paint()..color = adhered,
          );
        case Adherence.missed:
          final outline = Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = missed;
          canvas.drawCircle(centre, radius, outline);
          // The strike. What separates a missed day from an unanswered one at
          // a glance, and it survives being printed in grey.
          canvas.drawLine(
            centre + Offset(-radius * 0.6, radius * 0.6),
            centre + Offset(radius * 0.6, -radius * 0.6),
            outline,
          );
        case Adherence.unanswered:
          canvas.drawCircle(
            centre,
            radius,
            Paint()
              ..style = PaintingStyle.stroke
              // Thinner than the missed outline on purpose: an unanswered day
              // should recede, because it is the absence of an answer and not a
              // verdict about the member.
              ..strokeWidth = 1
              ..color = unanswered,
          );
      }
    }
  }

  @override
  bool shouldRepaint(_StripPainter old) =>
      old.dotSize != dotSize ||
      old.adhered != adhered ||
      old.missed != missed ||
      old.unanswered != unanswered ||
      old.week.length != week.length ||
      // Compared per day rather than by identity: the cubit hands out a fresh
      // list on every pass, so an identity check would repaint every sync and
      // a length check alone would miss the one that matters — today's dot
      // turning from unanswered into adhered.
      List.generate(
        week.length,
        (i) => old.week[i].adherence != week[i].adherence,
      ).any((changed) => changed);
}
