// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $KeyValuesTable extends KeyValues
    with TableInfo<$KeyValuesTable, KeyValue> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $KeyValuesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
      'key', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<String> value = GeneratedColumn<String>(
      'value', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [key, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'key_values';
  @override
  VerificationContext validateIntegrity(Insertable<KeyValue> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
          _keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value')) {
      context.handle(
          _valueMeta, value.isAcceptableOrUnknown(data['value']!, _valueMeta));
    } else if (isInserting) {
      context.missing(_valueMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  KeyValue map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return KeyValue(
      key: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      value: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}value'])!,
    );
  }

  @override
  $KeyValuesTable createAlias(String alias) {
    return $KeyValuesTable(attachedDatabase, alias);
  }
}

class KeyValue extends DataClass implements Insertable<KeyValue> {
  final String key;
  final String value;
  const KeyValue({required this.key, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value'] = Variable<String>(value);
    return map;
  }

  KeyValuesCompanion toCompanion(bool nullToAbsent) {
    return KeyValuesCompanion(
      key: Value(key),
      value: Value(value),
    );
  }

  factory KeyValue.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return KeyValue(
      key: serializer.fromJson<String>(json['key']),
      value: serializer.fromJson<String>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'value': serializer.toJson<String>(value),
    };
  }

  KeyValue copyWith({String? key, String? value}) => KeyValue(
        key: key ?? this.key,
        value: value ?? this.value,
      );
  KeyValue copyWithCompanion(KeyValuesCompanion data) {
    return KeyValue(
      key: data.key.present ? data.key.value : this.key,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('KeyValue(')
          ..write('key: $key, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is KeyValue && other.key == this.key && other.value == this.value);
}

class KeyValuesCompanion extends UpdateCompanion<KeyValue> {
  final Value<String> key;
  final Value<String> value;
  final Value<int> rowid;
  const KeyValuesCompanion({
    this.key = const Value.absent(),
    this.value = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  KeyValuesCompanion.insert({
    required String key,
    required String value,
    this.rowid = const Value.absent(),
  })  : key = Value(key),
        value = Value(value);
  static Insertable<KeyValue> custom({
    Expression<String>? key,
    Expression<String>? value,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (value != null) 'value': value,
      if (rowid != null) 'rowid': rowid,
    });
  }

  KeyValuesCompanion copyWith(
      {Value<String>? key, Value<String>? value, Value<int>? rowid}) {
    return KeyValuesCompanion(
      key: key ?? this.key,
      value: value ?? this.value,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (value.present) {
      map['value'] = Variable<String>(value.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('KeyValuesCompanion(')
          ..write('key: $key, ')
          ..write('value: $value, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ProfilesTable extends Profiles with TableInfo<$ProfilesTable, Profile> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ProfilesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _displayNameMeta =
      const VerificationMeta('displayName');
  @override
  late final GeneratedColumn<String> displayName = GeneratedColumn<String>(
      'display_name', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _photoPathMeta =
      const VerificationMeta('photoPath');
  @override
  late final GeneratedColumn<String> photoPath = GeneratedColumn<String>(
      'photo_path', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _timezoneMeta =
      const VerificationMeta('timezone');
  @override
  late final GeneratedColumn<String> timezone = GeneratedColumn<String>(
      'timezone', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _localeMeta = const VerificationMeta('locale');
  @override
  late final GeneratedColumn<String> locale = GeneratedColumn<String>(
      'locale', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _metricsJsonMeta =
      const VerificationMeta('metricsJson');
  @override
  late final GeneratedColumn<String> metricsJson = GeneratedColumn<String>(
      'metrics_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _foodLikesJsonMeta =
      const VerificationMeta('foodLikesJson');
  @override
  late final GeneratedColumn<String> foodLikesJson = GeneratedColumn<String>(
      'food_likes_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _foodDislikesJsonMeta =
      const VerificationMeta('foodDislikesJson');
  @override
  late final GeneratedColumn<String> foodDislikesJson = GeneratedColumn<String>(
      'food_dislikes_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _allergiesJsonMeta =
      const VerificationMeta('allergiesJson');
  @override
  late final GeneratedColumn<String> allergiesJson = GeneratedColumn<String>(
      'allergies_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _symptomsJsonMeta =
      const VerificationMeta('symptomsJson');
  @override
  late final GeneratedColumn<String> symptomsJson = GeneratedColumn<String>(
      'symptoms_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _onboardingCompletedAtMeta =
      const VerificationMeta('onboardingCompletedAt');
  @override
  late final GeneratedColumn<DateTime> onboardingCompletedAt =
      GeneratedColumn<DateTime>('onboarding_completed_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _fetchedAtMeta =
      const VerificationMeta('fetchedAt');
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
      'fetched_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        userId,
        displayName,
        photoPath,
        timezone,
        locale,
        metricsJson,
        foodLikesJson,
        foodDislikesJson,
        allergiesJson,
        symptomsJson,
        onboardingCompletedAt,
        fetchedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'profiles';
  @override
  VerificationContext validateIntegrity(Insertable<Profile> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(_userIdMeta,
          userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('display_name')) {
      context.handle(
          _displayNameMeta,
          displayName.isAcceptableOrUnknown(
              data['display_name']!, _displayNameMeta));
    }
    if (data.containsKey('photo_path')) {
      context.handle(_photoPathMeta,
          photoPath.isAcceptableOrUnknown(data['photo_path']!, _photoPathMeta));
    }
    if (data.containsKey('timezone')) {
      context.handle(_timezoneMeta,
          timezone.isAcceptableOrUnknown(data['timezone']!, _timezoneMeta));
    } else if (isInserting) {
      context.missing(_timezoneMeta);
    }
    if (data.containsKey('locale')) {
      context.handle(_localeMeta,
          locale.isAcceptableOrUnknown(data['locale']!, _localeMeta));
    } else if (isInserting) {
      context.missing(_localeMeta);
    }
    if (data.containsKey('metrics_json')) {
      context.handle(
          _metricsJsonMeta,
          metricsJson.isAcceptableOrUnknown(
              data['metrics_json']!, _metricsJsonMeta));
    }
    if (data.containsKey('food_likes_json')) {
      context.handle(
          _foodLikesJsonMeta,
          foodLikesJson.isAcceptableOrUnknown(
              data['food_likes_json']!, _foodLikesJsonMeta));
    }
    if (data.containsKey('food_dislikes_json')) {
      context.handle(
          _foodDislikesJsonMeta,
          foodDislikesJson.isAcceptableOrUnknown(
              data['food_dislikes_json']!, _foodDislikesJsonMeta));
    }
    if (data.containsKey('allergies_json')) {
      context.handle(
          _allergiesJsonMeta,
          allergiesJson.isAcceptableOrUnknown(
              data['allergies_json']!, _allergiesJsonMeta));
    }
    if (data.containsKey('symptoms_json')) {
      context.handle(
          _symptomsJsonMeta,
          symptomsJson.isAcceptableOrUnknown(
              data['symptoms_json']!, _symptomsJsonMeta));
    }
    if (data.containsKey('onboarding_completed_at')) {
      context.handle(
          _onboardingCompletedAtMeta,
          onboardingCompletedAt.isAcceptableOrUnknown(
              data['onboarding_completed_at']!, _onboardingCompletedAtMeta));
    }
    if (data.containsKey('fetched_at')) {
      context.handle(_fetchedAtMeta,
          fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta));
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId};
  @override
  Profile map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return Profile(
      userId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}user_id'])!,
      displayName: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}display_name']),
      photoPath: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}photo_path']),
      timezone: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}timezone'])!,
      locale: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}locale'])!,
      metricsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}metrics_json'])!,
      foodLikesJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}food_likes_json'])!,
      foodDislikesJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}food_dislikes_json'])!,
      allergiesJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}allergies_json'])!,
      symptomsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}symptoms_json'])!,
      onboardingCompletedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime,
          data['${effectivePrefix}onboarding_completed_at']),
      fetchedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}fetched_at'])!,
    );
  }

  @override
  $ProfilesTable createAlias(String alias) {
    return $ProfilesTable(attachedDatabase, alias);
  }
}

class Profile extends DataClass implements Insertable<Profile> {
  final String userId;
  final String? displayName;
  final String? photoPath;
  final String timezone;
  final String locale;

  /// The metric history, as the JSON the API sent.
  ///
  /// Stored whole rather than as a table of its own: it is read together,
  /// never queried across members, and the server caps it. A `body_metrics`
  /// table would be a join for a list that is always shown in full.
  final String metricsJson;

  /// Four string lists, each stored as JSON for the same reason.
  final String foodLikesJson;
  final String foodDislikesJson;
  final String allergiesJson;
  final String symptomsJson;
  final DateTime? onboardingCompletedAt;

  /// When this mirror was last filled from the server. Not the profile's own
  /// updatedAt — this is about the copy, not the original.
  final DateTime fetchedAt;
  const Profile(
      {required this.userId,
      this.displayName,
      this.photoPath,
      required this.timezone,
      required this.locale,
      required this.metricsJson,
      required this.foodLikesJson,
      required this.foodDislikesJson,
      required this.allergiesJson,
      required this.symptomsJson,
      this.onboardingCompletedAt,
      required this.fetchedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    if (!nullToAbsent || displayName != null) {
      map['display_name'] = Variable<String>(displayName);
    }
    if (!nullToAbsent || photoPath != null) {
      map['photo_path'] = Variable<String>(photoPath);
    }
    map['timezone'] = Variable<String>(timezone);
    map['locale'] = Variable<String>(locale);
    map['metrics_json'] = Variable<String>(metricsJson);
    map['food_likes_json'] = Variable<String>(foodLikesJson);
    map['food_dislikes_json'] = Variable<String>(foodDislikesJson);
    map['allergies_json'] = Variable<String>(allergiesJson);
    map['symptoms_json'] = Variable<String>(symptomsJson);
    if (!nullToAbsent || onboardingCompletedAt != null) {
      map['onboarding_completed_at'] =
          Variable<DateTime>(onboardingCompletedAt);
    }
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  ProfilesCompanion toCompanion(bool nullToAbsent) {
    return ProfilesCompanion(
      userId: Value(userId),
      displayName: displayName == null && nullToAbsent
          ? const Value.absent()
          : Value(displayName),
      photoPath: photoPath == null && nullToAbsent
          ? const Value.absent()
          : Value(photoPath),
      timezone: Value(timezone),
      locale: Value(locale),
      metricsJson: Value(metricsJson),
      foodLikesJson: Value(foodLikesJson),
      foodDislikesJson: Value(foodDislikesJson),
      allergiesJson: Value(allergiesJson),
      symptomsJson: Value(symptomsJson),
      onboardingCompletedAt: onboardingCompletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(onboardingCompletedAt),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory Profile.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return Profile(
      userId: serializer.fromJson<String>(json['userId']),
      displayName: serializer.fromJson<String?>(json['displayName']),
      photoPath: serializer.fromJson<String?>(json['photoPath']),
      timezone: serializer.fromJson<String>(json['timezone']),
      locale: serializer.fromJson<String>(json['locale']),
      metricsJson: serializer.fromJson<String>(json['metricsJson']),
      foodLikesJson: serializer.fromJson<String>(json['foodLikesJson']),
      foodDislikesJson: serializer.fromJson<String>(json['foodDislikesJson']),
      allergiesJson: serializer.fromJson<String>(json['allergiesJson']),
      symptomsJson: serializer.fromJson<String>(json['symptomsJson']),
      onboardingCompletedAt:
          serializer.fromJson<DateTime?>(json['onboardingCompletedAt']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'displayName': serializer.toJson<String?>(displayName),
      'photoPath': serializer.toJson<String?>(photoPath),
      'timezone': serializer.toJson<String>(timezone),
      'locale': serializer.toJson<String>(locale),
      'metricsJson': serializer.toJson<String>(metricsJson),
      'foodLikesJson': serializer.toJson<String>(foodLikesJson),
      'foodDislikesJson': serializer.toJson<String>(foodDislikesJson),
      'allergiesJson': serializer.toJson<String>(allergiesJson),
      'symptomsJson': serializer.toJson<String>(symptomsJson),
      'onboardingCompletedAt':
          serializer.toJson<DateTime?>(onboardingCompletedAt),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  Profile copyWith(
          {String? userId,
          Value<String?> displayName = const Value.absent(),
          Value<String?> photoPath = const Value.absent(),
          String? timezone,
          String? locale,
          String? metricsJson,
          String? foodLikesJson,
          String? foodDislikesJson,
          String? allergiesJson,
          String? symptomsJson,
          Value<DateTime?> onboardingCompletedAt = const Value.absent(),
          DateTime? fetchedAt}) =>
      Profile(
        userId: userId ?? this.userId,
        displayName: displayName.present ? displayName.value : this.displayName,
        photoPath: photoPath.present ? photoPath.value : this.photoPath,
        timezone: timezone ?? this.timezone,
        locale: locale ?? this.locale,
        metricsJson: metricsJson ?? this.metricsJson,
        foodLikesJson: foodLikesJson ?? this.foodLikesJson,
        foodDislikesJson: foodDislikesJson ?? this.foodDislikesJson,
        allergiesJson: allergiesJson ?? this.allergiesJson,
        symptomsJson: symptomsJson ?? this.symptomsJson,
        onboardingCompletedAt: onboardingCompletedAt.present
            ? onboardingCompletedAt.value
            : this.onboardingCompletedAt,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );
  Profile copyWithCompanion(ProfilesCompanion data) {
    return Profile(
      userId: data.userId.present ? data.userId.value : this.userId,
      displayName:
          data.displayName.present ? data.displayName.value : this.displayName,
      photoPath: data.photoPath.present ? data.photoPath.value : this.photoPath,
      timezone: data.timezone.present ? data.timezone.value : this.timezone,
      locale: data.locale.present ? data.locale.value : this.locale,
      metricsJson:
          data.metricsJson.present ? data.metricsJson.value : this.metricsJson,
      foodLikesJson: data.foodLikesJson.present
          ? data.foodLikesJson.value
          : this.foodLikesJson,
      foodDislikesJson: data.foodDislikesJson.present
          ? data.foodDislikesJson.value
          : this.foodDislikesJson,
      allergiesJson: data.allergiesJson.present
          ? data.allergiesJson.value
          : this.allergiesJson,
      symptomsJson: data.symptomsJson.present
          ? data.symptomsJson.value
          : this.symptomsJson,
      onboardingCompletedAt: data.onboardingCompletedAt.present
          ? data.onboardingCompletedAt.value
          : this.onboardingCompletedAt,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('Profile(')
          ..write('userId: $userId, ')
          ..write('displayName: $displayName, ')
          ..write('photoPath: $photoPath, ')
          ..write('timezone: $timezone, ')
          ..write('locale: $locale, ')
          ..write('metricsJson: $metricsJson, ')
          ..write('foodLikesJson: $foodLikesJson, ')
          ..write('foodDislikesJson: $foodDislikesJson, ')
          ..write('allergiesJson: $allergiesJson, ')
          ..write('symptomsJson: $symptomsJson, ')
          ..write('onboardingCompletedAt: $onboardingCompletedAt, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      userId,
      displayName,
      photoPath,
      timezone,
      locale,
      metricsJson,
      foodLikesJson,
      foodDislikesJson,
      allergiesJson,
      symptomsJson,
      onboardingCompletedAt,
      fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is Profile &&
          other.userId == this.userId &&
          other.displayName == this.displayName &&
          other.photoPath == this.photoPath &&
          other.timezone == this.timezone &&
          other.locale == this.locale &&
          other.metricsJson == this.metricsJson &&
          other.foodLikesJson == this.foodLikesJson &&
          other.foodDislikesJson == this.foodDislikesJson &&
          other.allergiesJson == this.allergiesJson &&
          other.symptomsJson == this.symptomsJson &&
          other.onboardingCompletedAt == this.onboardingCompletedAt &&
          other.fetchedAt == this.fetchedAt);
}

class ProfilesCompanion extends UpdateCompanion<Profile> {
  final Value<String> userId;
  final Value<String?> displayName;
  final Value<String?> photoPath;
  final Value<String> timezone;
  final Value<String> locale;
  final Value<String> metricsJson;
  final Value<String> foodLikesJson;
  final Value<String> foodDislikesJson;
  final Value<String> allergiesJson;
  final Value<String> symptomsJson;
  final Value<DateTime?> onboardingCompletedAt;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const ProfilesCompanion({
    this.userId = const Value.absent(),
    this.displayName = const Value.absent(),
    this.photoPath = const Value.absent(),
    this.timezone = const Value.absent(),
    this.locale = const Value.absent(),
    this.metricsJson = const Value.absent(),
    this.foodLikesJson = const Value.absent(),
    this.foodDislikesJson = const Value.absent(),
    this.allergiesJson = const Value.absent(),
    this.symptomsJson = const Value.absent(),
    this.onboardingCompletedAt = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ProfilesCompanion.insert({
    required String userId,
    this.displayName = const Value.absent(),
    this.photoPath = const Value.absent(),
    required String timezone,
    required String locale,
    this.metricsJson = const Value.absent(),
    this.foodLikesJson = const Value.absent(),
    this.foodDislikesJson = const Value.absent(),
    this.allergiesJson = const Value.absent(),
    this.symptomsJson = const Value.absent(),
    this.onboardingCompletedAt = const Value.absent(),
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  })  : userId = Value(userId),
        timezone = Value(timezone),
        locale = Value(locale),
        fetchedAt = Value(fetchedAt);
  static Insertable<Profile> custom({
    Expression<String>? userId,
    Expression<String>? displayName,
    Expression<String>? photoPath,
    Expression<String>? timezone,
    Expression<String>? locale,
    Expression<String>? metricsJson,
    Expression<String>? foodLikesJson,
    Expression<String>? foodDislikesJson,
    Expression<String>? allergiesJson,
    Expression<String>? symptomsJson,
    Expression<DateTime>? onboardingCompletedAt,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (displayName != null) 'display_name': displayName,
      if (photoPath != null) 'photo_path': photoPath,
      if (timezone != null) 'timezone': timezone,
      if (locale != null) 'locale': locale,
      if (metricsJson != null) 'metrics_json': metricsJson,
      if (foodLikesJson != null) 'food_likes_json': foodLikesJson,
      if (foodDislikesJson != null) 'food_dislikes_json': foodDislikesJson,
      if (allergiesJson != null) 'allergies_json': allergiesJson,
      if (symptomsJson != null) 'symptoms_json': symptomsJson,
      if (onboardingCompletedAt != null)
        'onboarding_completed_at': onboardingCompletedAt,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ProfilesCompanion copyWith(
      {Value<String>? userId,
      Value<String?>? displayName,
      Value<String?>? photoPath,
      Value<String>? timezone,
      Value<String>? locale,
      Value<String>? metricsJson,
      Value<String>? foodLikesJson,
      Value<String>? foodDislikesJson,
      Value<String>? allergiesJson,
      Value<String>? symptomsJson,
      Value<DateTime?>? onboardingCompletedAt,
      Value<DateTime>? fetchedAt,
      Value<int>? rowid}) {
    return ProfilesCompanion(
      userId: userId ?? this.userId,
      displayName: displayName ?? this.displayName,
      photoPath: photoPath ?? this.photoPath,
      timezone: timezone ?? this.timezone,
      locale: locale ?? this.locale,
      metricsJson: metricsJson ?? this.metricsJson,
      foodLikesJson: foodLikesJson ?? this.foodLikesJson,
      foodDislikesJson: foodDislikesJson ?? this.foodDislikesJson,
      allergiesJson: allergiesJson ?? this.allergiesJson,
      symptomsJson: symptomsJson ?? this.symptomsJson,
      onboardingCompletedAt:
          onboardingCompletedAt ?? this.onboardingCompletedAt,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (displayName.present) {
      map['display_name'] = Variable<String>(displayName.value);
    }
    if (photoPath.present) {
      map['photo_path'] = Variable<String>(photoPath.value);
    }
    if (timezone.present) {
      map['timezone'] = Variable<String>(timezone.value);
    }
    if (locale.present) {
      map['locale'] = Variable<String>(locale.value);
    }
    if (metricsJson.present) {
      map['metrics_json'] = Variable<String>(metricsJson.value);
    }
    if (foodLikesJson.present) {
      map['food_likes_json'] = Variable<String>(foodLikesJson.value);
    }
    if (foodDislikesJson.present) {
      map['food_dislikes_json'] = Variable<String>(foodDislikesJson.value);
    }
    if (allergiesJson.present) {
      map['allergies_json'] = Variable<String>(allergiesJson.value);
    }
    if (symptomsJson.present) {
      map['symptoms_json'] = Variable<String>(symptomsJson.value);
    }
    if (onboardingCompletedAt.present) {
      map['onboarding_completed_at'] =
          Variable<DateTime>(onboardingCompletedAt.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<DateTime>(fetchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ProfilesCompanion(')
          ..write('userId: $userId, ')
          ..write('displayName: $displayName, ')
          ..write('photoPath: $photoPath, ')
          ..write('timezone: $timezone, ')
          ..write('locale: $locale, ')
          ..write('metricsJson: $metricsJson, ')
          ..write('foodLikesJson: $foodLikesJson, ')
          ..write('foodDislikesJson: $foodDislikesJson, ')
          ..write('allergiesJson: $allergiesJson, ')
          ..write('symptomsJson: $symptomsJson, ')
          ..write('onboardingCompletedAt: $onboardingCompletedAt, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $UserPreferencesTable extends UserPreferences
    with TableInfo<$UserPreferencesTable, UserPreference> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $UserPreferencesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _planTomorrowTimeMeta =
      const VerificationMeta('planTomorrowTime');
  @override
  late final GeneratedColumn<String> planTomorrowTime = GeneratedColumn<String>(
      'plan_tomorrow_time', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _endOfDayTimeMeta =
      const VerificationMeta('endOfDayTime');
  @override
  late final GeneratedColumn<String> endOfDayTime = GeneratedColumn<String>(
      'end_of_day_time', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _morningBriefingTimeMeta =
      const VerificationMeta('morningBriefingTime');
  @override
  late final GeneratedColumn<String> morningBriefingTime =
      GeneratedColumn<String>('morning_briefing_time', aliasedName, false,
          type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _nextPracticeCutoffMeta =
      const VerificationMeta('nextPracticeCutoff');
  @override
  late final GeneratedColumn<String> nextPracticeCutoff =
      GeneratedColumn<String>('next_practice_cutoff', aliasedName, false,
          type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _leadTimesJsonMeta =
      const VerificationMeta('leadTimesJson');
  @override
  late final GeneratedColumn<String> leadTimesJson = GeneratedColumn<String>(
      'lead_times_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _quietFromMeta =
      const VerificationMeta('quietFrom');
  @override
  late final GeneratedColumn<String> quietFrom = GeneratedColumn<String>(
      'quiet_from', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _quietToMeta =
      const VerificationMeta('quietTo');
  @override
  late final GeneratedColumn<String> quietTo = GeneratedColumn<String>(
      'quiet_to', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _weekStartsOnMeta =
      const VerificationMeta('weekStartsOn');
  @override
  late final GeneratedColumn<String> weekStartsOn = GeneratedColumn<String>(
      'week_starts_on', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _checkinEnabledMeta =
      const VerificationMeta('checkinEnabled');
  @override
  late final GeneratedColumn<bool> checkinEnabled = GeneratedColumn<bool>(
      'checkin_enabled', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: true,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("checkin_enabled" IN (0, 1))'));
  static const VerificationMeta _meetingDurationMinMeta =
      const VerificationMeta('meetingDurationMin');
  @override
  late final GeneratedColumn<int> meetingDurationMin = GeneratedColumn<int>(
      'meeting_duration_min', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: true);
  static const VerificationMeta _mealModeMeta =
      const VerificationMeta('mealMode');
  @override
  late final GeneratedColumn<String> mealMode = GeneratedColumn<String>(
      'meal_mode', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _aiSuggestionsMeta =
      const VerificationMeta('aiSuggestions');
  @override
  late final GeneratedColumn<bool> aiSuggestions = GeneratedColumn<bool>(
      'ai_suggestions', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: true,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("ai_suggestions" IN (0, 1))'));
  static const VerificationMeta _fetchedAtMeta =
      const VerificationMeta('fetchedAt');
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
      'fetched_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        userId,
        planTomorrowTime,
        endOfDayTime,
        morningBriefingTime,
        nextPracticeCutoff,
        leadTimesJson,
        quietFrom,
        quietTo,
        weekStartsOn,
        checkinEnabled,
        meetingDurationMin,
        mealMode,
        aiSuggestions,
        fetchedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'user_preferences';
  @override
  VerificationContext validateIntegrity(Insertable<UserPreference> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(_userIdMeta,
          userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('plan_tomorrow_time')) {
      context.handle(
          _planTomorrowTimeMeta,
          planTomorrowTime.isAcceptableOrUnknown(
              data['plan_tomorrow_time']!, _planTomorrowTimeMeta));
    } else if (isInserting) {
      context.missing(_planTomorrowTimeMeta);
    }
    if (data.containsKey('end_of_day_time')) {
      context.handle(
          _endOfDayTimeMeta,
          endOfDayTime.isAcceptableOrUnknown(
              data['end_of_day_time']!, _endOfDayTimeMeta));
    } else if (isInserting) {
      context.missing(_endOfDayTimeMeta);
    }
    if (data.containsKey('morning_briefing_time')) {
      context.handle(
          _morningBriefingTimeMeta,
          morningBriefingTime.isAcceptableOrUnknown(
              data['morning_briefing_time']!, _morningBriefingTimeMeta));
    } else if (isInserting) {
      context.missing(_morningBriefingTimeMeta);
    }
    if (data.containsKey('next_practice_cutoff')) {
      context.handle(
          _nextPracticeCutoffMeta,
          nextPracticeCutoff.isAcceptableOrUnknown(
              data['next_practice_cutoff']!, _nextPracticeCutoffMeta));
    } else if (isInserting) {
      context.missing(_nextPracticeCutoffMeta);
    }
    if (data.containsKey('lead_times_json')) {
      context.handle(
          _leadTimesJsonMeta,
          leadTimesJson.isAcceptableOrUnknown(
              data['lead_times_json']!, _leadTimesJsonMeta));
    }
    if (data.containsKey('quiet_from')) {
      context.handle(_quietFromMeta,
          quietFrom.isAcceptableOrUnknown(data['quiet_from']!, _quietFromMeta));
    } else if (isInserting) {
      context.missing(_quietFromMeta);
    }
    if (data.containsKey('quiet_to')) {
      context.handle(_quietToMeta,
          quietTo.isAcceptableOrUnknown(data['quiet_to']!, _quietToMeta));
    } else if (isInserting) {
      context.missing(_quietToMeta);
    }
    if (data.containsKey('week_starts_on')) {
      context.handle(
          _weekStartsOnMeta,
          weekStartsOn.isAcceptableOrUnknown(
              data['week_starts_on']!, _weekStartsOnMeta));
    } else if (isInserting) {
      context.missing(_weekStartsOnMeta);
    }
    if (data.containsKey('checkin_enabled')) {
      context.handle(
          _checkinEnabledMeta,
          checkinEnabled.isAcceptableOrUnknown(
              data['checkin_enabled']!, _checkinEnabledMeta));
    } else if (isInserting) {
      context.missing(_checkinEnabledMeta);
    }
    if (data.containsKey('meeting_duration_min')) {
      context.handle(
          _meetingDurationMinMeta,
          meetingDurationMin.isAcceptableOrUnknown(
              data['meeting_duration_min']!, _meetingDurationMinMeta));
    } else if (isInserting) {
      context.missing(_meetingDurationMinMeta);
    }
    if (data.containsKey('meal_mode')) {
      context.handle(_mealModeMeta,
          mealMode.isAcceptableOrUnknown(data['meal_mode']!, _mealModeMeta));
    } else if (isInserting) {
      context.missing(_mealModeMeta);
    }
    if (data.containsKey('ai_suggestions')) {
      context.handle(
          _aiSuggestionsMeta,
          aiSuggestions.isAcceptableOrUnknown(
              data['ai_suggestions']!, _aiSuggestionsMeta));
    } else if (isInserting) {
      context.missing(_aiSuggestionsMeta);
    }
    if (data.containsKey('fetched_at')) {
      context.handle(_fetchedAtMeta,
          fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta));
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId};
  @override
  UserPreference map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return UserPreference(
      userId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}user_id'])!,
      planTomorrowTime: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}plan_tomorrow_time'])!,
      endOfDayTime: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}end_of_day_time'])!,
      morningBriefingTime: attachedDatabase.typeMapping.read(
          DriftSqlType.string,
          data['${effectivePrefix}morning_briefing_time'])!,
      nextPracticeCutoff: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}next_practice_cutoff'])!,
      leadTimesJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}lead_times_json'])!,
      quietFrom: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}quiet_from'])!,
      quietTo: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}quiet_to'])!,
      weekStartsOn: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}week_starts_on'])!,
      checkinEnabled: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}checkin_enabled'])!,
      meetingDurationMin: attachedDatabase.typeMapping.read(
          DriftSqlType.int, data['${effectivePrefix}meeting_duration_min'])!,
      mealMode: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}meal_mode'])!,
      aiSuggestions: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}ai_suggestions'])!,
      fetchedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}fetched_at'])!,
    );
  }

  @override
  $UserPreferencesTable createAlias(String alias) {
    return $UserPreferencesTable(attachedDatabase, alias);
  }
}

class UserPreference extends DataClass implements Insertable<UserPreference> {
  final String userId;
  final String planTomorrowTime;
  final String endOfDayTime;
  final String morningBriefingTime;
  final String nextPracticeCutoff;
  final String leadTimesJson;
  final String quietFrom;
  final String quietTo;
  final String weekStartsOn;
  final bool checkinEnabled;
  final int meetingDurationMin;
  final String mealMode;
  final bool aiSuggestions;
  final DateTime fetchedAt;
  const UserPreference(
      {required this.userId,
      required this.planTomorrowTime,
      required this.endOfDayTime,
      required this.morningBriefingTime,
      required this.nextPracticeCutoff,
      required this.leadTimesJson,
      required this.quietFrom,
      required this.quietTo,
      required this.weekStartsOn,
      required this.checkinEnabled,
      required this.meetingDurationMin,
      required this.mealMode,
      required this.aiSuggestions,
      required this.fetchedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    map['plan_tomorrow_time'] = Variable<String>(planTomorrowTime);
    map['end_of_day_time'] = Variable<String>(endOfDayTime);
    map['morning_briefing_time'] = Variable<String>(morningBriefingTime);
    map['next_practice_cutoff'] = Variable<String>(nextPracticeCutoff);
    map['lead_times_json'] = Variable<String>(leadTimesJson);
    map['quiet_from'] = Variable<String>(quietFrom);
    map['quiet_to'] = Variable<String>(quietTo);
    map['week_starts_on'] = Variable<String>(weekStartsOn);
    map['checkin_enabled'] = Variable<bool>(checkinEnabled);
    map['meeting_duration_min'] = Variable<int>(meetingDurationMin);
    map['meal_mode'] = Variable<String>(mealMode);
    map['ai_suggestions'] = Variable<bool>(aiSuggestions);
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  UserPreferencesCompanion toCompanion(bool nullToAbsent) {
    return UserPreferencesCompanion(
      userId: Value(userId),
      planTomorrowTime: Value(planTomorrowTime),
      endOfDayTime: Value(endOfDayTime),
      morningBriefingTime: Value(morningBriefingTime),
      nextPracticeCutoff: Value(nextPracticeCutoff),
      leadTimesJson: Value(leadTimesJson),
      quietFrom: Value(quietFrom),
      quietTo: Value(quietTo),
      weekStartsOn: Value(weekStartsOn),
      checkinEnabled: Value(checkinEnabled),
      meetingDurationMin: Value(meetingDurationMin),
      mealMode: Value(mealMode),
      aiSuggestions: Value(aiSuggestions),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory UserPreference.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return UserPreference(
      userId: serializer.fromJson<String>(json['userId']),
      planTomorrowTime: serializer.fromJson<String>(json['planTomorrowTime']),
      endOfDayTime: serializer.fromJson<String>(json['endOfDayTime']),
      morningBriefingTime:
          serializer.fromJson<String>(json['morningBriefingTime']),
      nextPracticeCutoff:
          serializer.fromJson<String>(json['nextPracticeCutoff']),
      leadTimesJson: serializer.fromJson<String>(json['leadTimesJson']),
      quietFrom: serializer.fromJson<String>(json['quietFrom']),
      quietTo: serializer.fromJson<String>(json['quietTo']),
      weekStartsOn: serializer.fromJson<String>(json['weekStartsOn']),
      checkinEnabled: serializer.fromJson<bool>(json['checkinEnabled']),
      meetingDurationMin: serializer.fromJson<int>(json['meetingDurationMin']),
      mealMode: serializer.fromJson<String>(json['mealMode']),
      aiSuggestions: serializer.fromJson<bool>(json['aiSuggestions']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'planTomorrowTime': serializer.toJson<String>(planTomorrowTime),
      'endOfDayTime': serializer.toJson<String>(endOfDayTime),
      'morningBriefingTime': serializer.toJson<String>(morningBriefingTime),
      'nextPracticeCutoff': serializer.toJson<String>(nextPracticeCutoff),
      'leadTimesJson': serializer.toJson<String>(leadTimesJson),
      'quietFrom': serializer.toJson<String>(quietFrom),
      'quietTo': serializer.toJson<String>(quietTo),
      'weekStartsOn': serializer.toJson<String>(weekStartsOn),
      'checkinEnabled': serializer.toJson<bool>(checkinEnabled),
      'meetingDurationMin': serializer.toJson<int>(meetingDurationMin),
      'mealMode': serializer.toJson<String>(mealMode),
      'aiSuggestions': serializer.toJson<bool>(aiSuggestions),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  UserPreference copyWith(
          {String? userId,
          String? planTomorrowTime,
          String? endOfDayTime,
          String? morningBriefingTime,
          String? nextPracticeCutoff,
          String? leadTimesJson,
          String? quietFrom,
          String? quietTo,
          String? weekStartsOn,
          bool? checkinEnabled,
          int? meetingDurationMin,
          String? mealMode,
          bool? aiSuggestions,
          DateTime? fetchedAt}) =>
      UserPreference(
        userId: userId ?? this.userId,
        planTomorrowTime: planTomorrowTime ?? this.planTomorrowTime,
        endOfDayTime: endOfDayTime ?? this.endOfDayTime,
        morningBriefingTime: morningBriefingTime ?? this.morningBriefingTime,
        nextPracticeCutoff: nextPracticeCutoff ?? this.nextPracticeCutoff,
        leadTimesJson: leadTimesJson ?? this.leadTimesJson,
        quietFrom: quietFrom ?? this.quietFrom,
        quietTo: quietTo ?? this.quietTo,
        weekStartsOn: weekStartsOn ?? this.weekStartsOn,
        checkinEnabled: checkinEnabled ?? this.checkinEnabled,
        meetingDurationMin: meetingDurationMin ?? this.meetingDurationMin,
        mealMode: mealMode ?? this.mealMode,
        aiSuggestions: aiSuggestions ?? this.aiSuggestions,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );
  UserPreference copyWithCompanion(UserPreferencesCompanion data) {
    return UserPreference(
      userId: data.userId.present ? data.userId.value : this.userId,
      planTomorrowTime: data.planTomorrowTime.present
          ? data.planTomorrowTime.value
          : this.planTomorrowTime,
      endOfDayTime: data.endOfDayTime.present
          ? data.endOfDayTime.value
          : this.endOfDayTime,
      morningBriefingTime: data.morningBriefingTime.present
          ? data.morningBriefingTime.value
          : this.morningBriefingTime,
      nextPracticeCutoff: data.nextPracticeCutoff.present
          ? data.nextPracticeCutoff.value
          : this.nextPracticeCutoff,
      leadTimesJson: data.leadTimesJson.present
          ? data.leadTimesJson.value
          : this.leadTimesJson,
      quietFrom: data.quietFrom.present ? data.quietFrom.value : this.quietFrom,
      quietTo: data.quietTo.present ? data.quietTo.value : this.quietTo,
      weekStartsOn: data.weekStartsOn.present
          ? data.weekStartsOn.value
          : this.weekStartsOn,
      checkinEnabled: data.checkinEnabled.present
          ? data.checkinEnabled.value
          : this.checkinEnabled,
      meetingDurationMin: data.meetingDurationMin.present
          ? data.meetingDurationMin.value
          : this.meetingDurationMin,
      mealMode: data.mealMode.present ? data.mealMode.value : this.mealMode,
      aiSuggestions: data.aiSuggestions.present
          ? data.aiSuggestions.value
          : this.aiSuggestions,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('UserPreference(')
          ..write('userId: $userId, ')
          ..write('planTomorrowTime: $planTomorrowTime, ')
          ..write('endOfDayTime: $endOfDayTime, ')
          ..write('morningBriefingTime: $morningBriefingTime, ')
          ..write('nextPracticeCutoff: $nextPracticeCutoff, ')
          ..write('leadTimesJson: $leadTimesJson, ')
          ..write('quietFrom: $quietFrom, ')
          ..write('quietTo: $quietTo, ')
          ..write('weekStartsOn: $weekStartsOn, ')
          ..write('checkinEnabled: $checkinEnabled, ')
          ..write('meetingDurationMin: $meetingDurationMin, ')
          ..write('mealMode: $mealMode, ')
          ..write('aiSuggestions: $aiSuggestions, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      userId,
      planTomorrowTime,
      endOfDayTime,
      morningBriefingTime,
      nextPracticeCutoff,
      leadTimesJson,
      quietFrom,
      quietTo,
      weekStartsOn,
      checkinEnabled,
      meetingDurationMin,
      mealMode,
      aiSuggestions,
      fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is UserPreference &&
          other.userId == this.userId &&
          other.planTomorrowTime == this.planTomorrowTime &&
          other.endOfDayTime == this.endOfDayTime &&
          other.morningBriefingTime == this.morningBriefingTime &&
          other.nextPracticeCutoff == this.nextPracticeCutoff &&
          other.leadTimesJson == this.leadTimesJson &&
          other.quietFrom == this.quietFrom &&
          other.quietTo == this.quietTo &&
          other.weekStartsOn == this.weekStartsOn &&
          other.checkinEnabled == this.checkinEnabled &&
          other.meetingDurationMin == this.meetingDurationMin &&
          other.mealMode == this.mealMode &&
          other.aiSuggestions == this.aiSuggestions &&
          other.fetchedAt == this.fetchedAt);
}

class UserPreferencesCompanion extends UpdateCompanion<UserPreference> {
  final Value<String> userId;
  final Value<String> planTomorrowTime;
  final Value<String> endOfDayTime;
  final Value<String> morningBriefingTime;
  final Value<String> nextPracticeCutoff;
  final Value<String> leadTimesJson;
  final Value<String> quietFrom;
  final Value<String> quietTo;
  final Value<String> weekStartsOn;
  final Value<bool> checkinEnabled;
  final Value<int> meetingDurationMin;
  final Value<String> mealMode;
  final Value<bool> aiSuggestions;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const UserPreferencesCompanion({
    this.userId = const Value.absent(),
    this.planTomorrowTime = const Value.absent(),
    this.endOfDayTime = const Value.absent(),
    this.morningBriefingTime = const Value.absent(),
    this.nextPracticeCutoff = const Value.absent(),
    this.leadTimesJson = const Value.absent(),
    this.quietFrom = const Value.absent(),
    this.quietTo = const Value.absent(),
    this.weekStartsOn = const Value.absent(),
    this.checkinEnabled = const Value.absent(),
    this.meetingDurationMin = const Value.absent(),
    this.mealMode = const Value.absent(),
    this.aiSuggestions = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  UserPreferencesCompanion.insert({
    required String userId,
    required String planTomorrowTime,
    required String endOfDayTime,
    required String morningBriefingTime,
    required String nextPracticeCutoff,
    this.leadTimesJson = const Value.absent(),
    required String quietFrom,
    required String quietTo,
    required String weekStartsOn,
    required bool checkinEnabled,
    required int meetingDurationMin,
    required String mealMode,
    required bool aiSuggestions,
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  })  : userId = Value(userId),
        planTomorrowTime = Value(planTomorrowTime),
        endOfDayTime = Value(endOfDayTime),
        morningBriefingTime = Value(morningBriefingTime),
        nextPracticeCutoff = Value(nextPracticeCutoff),
        quietFrom = Value(quietFrom),
        quietTo = Value(quietTo),
        weekStartsOn = Value(weekStartsOn),
        checkinEnabled = Value(checkinEnabled),
        meetingDurationMin = Value(meetingDurationMin),
        mealMode = Value(mealMode),
        aiSuggestions = Value(aiSuggestions),
        fetchedAt = Value(fetchedAt);
  static Insertable<UserPreference> custom({
    Expression<String>? userId,
    Expression<String>? planTomorrowTime,
    Expression<String>? endOfDayTime,
    Expression<String>? morningBriefingTime,
    Expression<String>? nextPracticeCutoff,
    Expression<String>? leadTimesJson,
    Expression<String>? quietFrom,
    Expression<String>? quietTo,
    Expression<String>? weekStartsOn,
    Expression<bool>? checkinEnabled,
    Expression<int>? meetingDurationMin,
    Expression<String>? mealMode,
    Expression<bool>? aiSuggestions,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (planTomorrowTime != null) 'plan_tomorrow_time': planTomorrowTime,
      if (endOfDayTime != null) 'end_of_day_time': endOfDayTime,
      if (morningBriefingTime != null)
        'morning_briefing_time': morningBriefingTime,
      if (nextPracticeCutoff != null)
        'next_practice_cutoff': nextPracticeCutoff,
      if (leadTimesJson != null) 'lead_times_json': leadTimesJson,
      if (quietFrom != null) 'quiet_from': quietFrom,
      if (quietTo != null) 'quiet_to': quietTo,
      if (weekStartsOn != null) 'week_starts_on': weekStartsOn,
      if (checkinEnabled != null) 'checkin_enabled': checkinEnabled,
      if (meetingDurationMin != null)
        'meeting_duration_min': meetingDurationMin,
      if (mealMode != null) 'meal_mode': mealMode,
      if (aiSuggestions != null) 'ai_suggestions': aiSuggestions,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  UserPreferencesCompanion copyWith(
      {Value<String>? userId,
      Value<String>? planTomorrowTime,
      Value<String>? endOfDayTime,
      Value<String>? morningBriefingTime,
      Value<String>? nextPracticeCutoff,
      Value<String>? leadTimesJson,
      Value<String>? quietFrom,
      Value<String>? quietTo,
      Value<String>? weekStartsOn,
      Value<bool>? checkinEnabled,
      Value<int>? meetingDurationMin,
      Value<String>? mealMode,
      Value<bool>? aiSuggestions,
      Value<DateTime>? fetchedAt,
      Value<int>? rowid}) {
    return UserPreferencesCompanion(
      userId: userId ?? this.userId,
      planTomorrowTime: planTomorrowTime ?? this.planTomorrowTime,
      endOfDayTime: endOfDayTime ?? this.endOfDayTime,
      morningBriefingTime: morningBriefingTime ?? this.morningBriefingTime,
      nextPracticeCutoff: nextPracticeCutoff ?? this.nextPracticeCutoff,
      leadTimesJson: leadTimesJson ?? this.leadTimesJson,
      quietFrom: quietFrom ?? this.quietFrom,
      quietTo: quietTo ?? this.quietTo,
      weekStartsOn: weekStartsOn ?? this.weekStartsOn,
      checkinEnabled: checkinEnabled ?? this.checkinEnabled,
      meetingDurationMin: meetingDurationMin ?? this.meetingDurationMin,
      mealMode: mealMode ?? this.mealMode,
      aiSuggestions: aiSuggestions ?? this.aiSuggestions,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (planTomorrowTime.present) {
      map['plan_tomorrow_time'] = Variable<String>(planTomorrowTime.value);
    }
    if (endOfDayTime.present) {
      map['end_of_day_time'] = Variable<String>(endOfDayTime.value);
    }
    if (morningBriefingTime.present) {
      map['morning_briefing_time'] =
          Variable<String>(morningBriefingTime.value);
    }
    if (nextPracticeCutoff.present) {
      map['next_practice_cutoff'] = Variable<String>(nextPracticeCutoff.value);
    }
    if (leadTimesJson.present) {
      map['lead_times_json'] = Variable<String>(leadTimesJson.value);
    }
    if (quietFrom.present) {
      map['quiet_from'] = Variable<String>(quietFrom.value);
    }
    if (quietTo.present) {
      map['quiet_to'] = Variable<String>(quietTo.value);
    }
    if (weekStartsOn.present) {
      map['week_starts_on'] = Variable<String>(weekStartsOn.value);
    }
    if (checkinEnabled.present) {
      map['checkin_enabled'] = Variable<bool>(checkinEnabled.value);
    }
    if (meetingDurationMin.present) {
      map['meeting_duration_min'] = Variable<int>(meetingDurationMin.value);
    }
    if (mealMode.present) {
      map['meal_mode'] = Variable<String>(mealMode.value);
    }
    if (aiSuggestions.present) {
      map['ai_suggestions'] = Variable<bool>(aiSuggestions.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<DateTime>(fetchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('UserPreferencesCompanion(')
          ..write('userId: $userId, ')
          ..write('planTomorrowTime: $planTomorrowTime, ')
          ..write('endOfDayTime: $endOfDayTime, ')
          ..write('morningBriefingTime: $morningBriefingTime, ')
          ..write('nextPracticeCutoff: $nextPracticeCutoff, ')
          ..write('leadTimesJson: $leadTimesJson, ')
          ..write('quietFrom: $quietFrom, ')
          ..write('quietTo: $quietTo, ')
          ..write('weekStartsOn: $weekStartsOn, ')
          ..write('checkinEnabled: $checkinEnabled, ')
          ..write('meetingDurationMin: $meetingDurationMin, ')
          ..write('mealMode: $mealMode, ')
          ..write('aiSuggestions: $aiSuggestions, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LabelsTable extends Labels with TableInfo<$LabelsTable, LocalLabel> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LabelsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _baseUpdatedAtMeta =
      const VerificationMeta('baseUpdatedAt');
  @override
  late final GeneratedColumn<DateTime> baseUpdatedAt =
      GeneratedColumn<DateTime>('base_updated_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _pendingOpMeta =
      const VerificationMeta('pendingOp');
  @override
  late final GeneratedColumn<String> pendingOp = GeneratedColumn<String>(
      'pending_op', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _pushAttemptsMeta =
      const VerificationMeta('pushAttempts');
  @override
  late final GeneratedColumn<int> pushAttempts = GeneratedColumn<int>(
      'push_attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _deletedAtMeta =
      const VerificationMeta('deletedAt');
  @override
  late final GeneratedColumn<DateTime> deletedAt = GeneratedColumn<DateTime>(
      'deleted_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
      'name', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<String> color = GeneratedColumn<String>(
      'color', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sortOrderMeta =
      const VerificationMeta('sortOrder');
  @override
  late final GeneratedColumn<int> sortOrder = GeneratedColumn<int>(
      'sort_order', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        name,
        color,
        sortOrder,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'labels';
  @override
  VerificationContext validateIntegrity(Insertable<LocalLabel> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('base_updated_at')) {
      context.handle(
          _baseUpdatedAtMeta,
          baseUpdatedAt.isAcceptableOrUnknown(
              data['base_updated_at']!, _baseUpdatedAtMeta));
    }
    if (data.containsKey('pending_op')) {
      context.handle(_pendingOpMeta,
          pendingOp.isAcceptableOrUnknown(data['pending_op']!, _pendingOpMeta));
    }
    if (data.containsKey('push_attempts')) {
      context.handle(
          _pushAttemptsMeta,
          pushAttempts.isAcceptableOrUnknown(
              data['push_attempts']!, _pushAttemptsMeta));
    }
    if (data.containsKey('deleted_at')) {
      context.handle(_deletedAtMeta,
          deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta));
    }
    if (data.containsKey('name')) {
      context.handle(
          _nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('color')) {
      context.handle(
          _colorMeta, color.isAcceptableOrUnknown(data['color']!, _colorMeta));
    } else if (isInserting) {
      context.missing(_colorMeta);
    }
    if (data.containsKey('sort_order')) {
      context.handle(_sortOrderMeta,
          sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalLabel map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalLabel(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
      baseUpdatedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}base_updated_at']),
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
      deletedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}deleted_at']),
      name: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      color: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}color'])!,
      sortOrder: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}sort_order'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $LabelsTable createAlias(String alias) {
    return $LabelsTable(attachedDatabase, alias);
  }
}

class LocalLabel extends DataClass implements Insertable<LocalLabel> {
  /// Client-minted UUIDv7 for anything the phone can create offline, so a
  /// retried create is a no-op rather than a duplicate.
  final String id;
  final DateTime updatedAt;

  /// Null until a pull fills it in: the row has never been reconciled against
  /// a server timestamp.
  final DateTime? baseUpdatedAt;

  /// What this device did that the server has not been told about, or null for
  /// a clean row. See [notPendingOp] before writing a filter over it.
  final String? pendingOp;
  final int pushAttempts;

  /// A delete keeps the row and never touches its status: the status is the
  /// only record of whether the thing was completed, cancelled or never dealt
  /// with, and the Deleted view exists to show exactly that.
  final DateTime? deletedAt;
  final String name;

  /// `#rrggbb`. A palette entry or a colour the member picked themselves —
  /// which is why this is a string and not an index into the palette: the
  /// palette is an operator setting (`settings.labels.palette`) and may change
  /// under a label that was already given one of its colours.
  final String color;
  final int sortOrder;
  final DateTime createdAt;
  const LocalLabel(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.name,
      required this.color,
      required this.sortOrder,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    if (!nullToAbsent || baseUpdatedAt != null) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt);
    }
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<DateTime>(deletedAt);
    }
    map['name'] = Variable<String>(name);
    map['color'] = Variable<String>(color);
    map['sort_order'] = Variable<int>(sortOrder);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  LabelsCompanion toCompanion(bool nullToAbsent) {
    return LabelsCompanion(
      id: Value(id),
      updatedAt: Value(updatedAt),
      baseUpdatedAt: baseUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(baseUpdatedAt),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      name: Value(name),
      color: Value(color),
      sortOrder: Value(sortOrder),
      createdAt: Value(createdAt),
    );
  }

  factory LocalLabel.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalLabel(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      name: serializer.fromJson<String>(json['name']),
      color: serializer.fromJson<String>(json['color']),
      sortOrder: serializer.fromJson<int>(json['sortOrder']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'baseUpdatedAt': serializer.toJson<DateTime?>(baseUpdatedAt),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
      'deletedAt': serializer.toJson<DateTime?>(deletedAt),
      'name': serializer.toJson<String>(name),
      'color': serializer.toJson<String>(color),
      'sortOrder': serializer.toJson<int>(sortOrder),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalLabel copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? name,
          String? color,
          int? sortOrder,
          DateTime? createdAt}) =>
      LocalLabel(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        name: name ?? this.name,
        color: color ?? this.color,
        sortOrder: sortOrder ?? this.sortOrder,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalLabel copyWithCompanion(LabelsCompanion data) {
    return LocalLabel(
      id: data.id.present ? data.id.value : this.id,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      baseUpdatedAt: data.baseUpdatedAt.present
          ? data.baseUpdatedAt.value
          : this.baseUpdatedAt,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      name: data.name.present ? data.name.value : this.name,
      color: data.color.present ? data.color.value : this.color,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalLabel(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('name: $name, ')
          ..write('color: $color, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, updatedAt, baseUpdatedAt, pendingOp,
      pushAttempts, deletedAt, name, color, sortOrder, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalLabel &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.name == this.name &&
          other.color == this.color &&
          other.sortOrder == this.sortOrder &&
          other.createdAt == this.createdAt);
}

class LabelsCompanion extends UpdateCompanion<LocalLabel> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> name;
  final Value<String> color;
  final Value<int> sortOrder;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const LabelsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.name = const Value.absent(),
    this.color = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LabelsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String name,
    required String color,
    this.sortOrder = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        name = Value(name),
        color = Value(color),
        createdAt = Value(createdAt);
  static Insertable<LocalLabel> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? name,
    Expression<String>? color,
    Expression<int>? sortOrder,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (name != null) 'name': name,
      if (color != null) 'color': color,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LabelsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? name,
      Value<String>? color,
      Value<int>? sortOrder,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return LabelsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      name: name ?? this.name,
      color: color ?? this.color,
      sortOrder: sortOrder ?? this.sortOrder,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (baseUpdatedAt.present) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<DateTime>(deletedAt.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (color.present) {
      map['color'] = Variable<String>(color.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<int>(sortOrder.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LabelsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('name: $name, ')
          ..write('color: $color, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $TasksTable extends Tasks with TableInfo<$TasksTable, LocalTask> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TasksTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _baseUpdatedAtMeta =
      const VerificationMeta('baseUpdatedAt');
  @override
  late final GeneratedColumn<DateTime> baseUpdatedAt =
      GeneratedColumn<DateTime>('base_updated_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _pendingOpMeta =
      const VerificationMeta('pendingOp');
  @override
  late final GeneratedColumn<String> pendingOp = GeneratedColumn<String>(
      'pending_op', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _pushAttemptsMeta =
      const VerificationMeta('pushAttempts');
  @override
  late final GeneratedColumn<int> pushAttempts = GeneratedColumn<int>(
      'push_attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _deletedAtMeta =
      const VerificationMeta('deletedAt');
  @override
  late final GeneratedColumn<DateTime> deletedAt = GeneratedColumn<DateTime>(
      'deleted_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
      'notes', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _dueAtMeta = const VerificationMeta('dueAt');
  @override
  late final GeneratedColumn<DateTime> dueAt = GeneratedColumn<DateTime>(
      'due_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _allDayMeta = const VerificationMeta('allDay');
  @override
  late final GeneratedColumn<bool> allDay = GeneratedColumn<bool>(
      'all_day', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("all_day" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _priorityMeta =
      const VerificationMeta('priority');
  @override
  late final GeneratedColumn<int> priority = GeneratedColumn<int>(
      'priority', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(4));
  static const VerificationMeta _labelIdMeta =
      const VerificationMeta('labelId');
  @override
  late final GeneratedColumn<String> labelId = GeneratedColumn<String>(
      'label_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _labelNameMeta =
      const VerificationMeta('labelName');
  @override
  late final GeneratedColumn<String> labelName = GeneratedColumn<String>(
      'label_name', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _labelColorMeta =
      const VerificationMeta('labelColor');
  @override
  late final GeneratedColumn<String> labelColor = GeneratedColumn<String>(
      'label_color', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('open'));
  static const VerificationMeta _completedAtMeta =
      const VerificationMeta('completedAt');
  @override
  late final GeneratedColumn<DateTime> completedAt = GeneratedColumn<DateTime>(
      'completed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _recurrenceJsonMeta =
      const VerificationMeta('recurrenceJson');
  @override
  late final GeneratedColumn<String> recurrenceJson = GeneratedColumn<String>(
      'recurrence_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _estimatedMinutesMeta =
      const VerificationMeta('estimatedMinutes');
  @override
  late final GeneratedColumn<int> estimatedMinutes = GeneratedColumn<int>(
      'estimated_minutes', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _deferCountMeta =
      const VerificationMeta('deferCount');
  @override
  late final GeneratedColumn<int> deferCount = GeneratedColumn<int>(
      'defer_count', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _deferredFromMeta =
      const VerificationMeta('deferredFrom');
  @override
  late final GeneratedColumn<DateTime> deferredFrom = GeneratedColumn<DateTime>(
      'deferred_from', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('app'));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        title,
        notes,
        dueAt,
        allDay,
        priority,
        labelId,
        labelName,
        labelColor,
        status,
        completedAt,
        recurrenceJson,
        estimatedMinutes,
        deferCount,
        deferredFrom,
        source,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'tasks';
  @override
  VerificationContext validateIntegrity(Insertable<LocalTask> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('base_updated_at')) {
      context.handle(
          _baseUpdatedAtMeta,
          baseUpdatedAt.isAcceptableOrUnknown(
              data['base_updated_at']!, _baseUpdatedAtMeta));
    }
    if (data.containsKey('pending_op')) {
      context.handle(_pendingOpMeta,
          pendingOp.isAcceptableOrUnknown(data['pending_op']!, _pendingOpMeta));
    }
    if (data.containsKey('push_attempts')) {
      context.handle(
          _pushAttemptsMeta,
          pushAttempts.isAcceptableOrUnknown(
              data['push_attempts']!, _pushAttemptsMeta));
    }
    if (data.containsKey('deleted_at')) {
      context.handle(_deletedAtMeta,
          deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta));
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('notes')) {
      context.handle(
          _notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));
    }
    if (data.containsKey('due_at')) {
      context.handle(
          _dueAtMeta, dueAt.isAcceptableOrUnknown(data['due_at']!, _dueAtMeta));
    }
    if (data.containsKey('all_day')) {
      context.handle(_allDayMeta,
          allDay.isAcceptableOrUnknown(data['all_day']!, _allDayMeta));
    }
    if (data.containsKey('priority')) {
      context.handle(_priorityMeta,
          priority.isAcceptableOrUnknown(data['priority']!, _priorityMeta));
    }
    if (data.containsKey('label_id')) {
      context.handle(_labelIdMeta,
          labelId.isAcceptableOrUnknown(data['label_id']!, _labelIdMeta));
    }
    if (data.containsKey('label_name')) {
      context.handle(_labelNameMeta,
          labelName.isAcceptableOrUnknown(data['label_name']!, _labelNameMeta));
    }
    if (data.containsKey('label_color')) {
      context.handle(
          _labelColorMeta,
          labelColor.isAcceptableOrUnknown(
              data['label_color']!, _labelColorMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('completed_at')) {
      context.handle(
          _completedAtMeta,
          completedAt.isAcceptableOrUnknown(
              data['completed_at']!, _completedAtMeta));
    }
    if (data.containsKey('recurrence_json')) {
      context.handle(
          _recurrenceJsonMeta,
          recurrenceJson.isAcceptableOrUnknown(
              data['recurrence_json']!, _recurrenceJsonMeta));
    }
    if (data.containsKey('estimated_minutes')) {
      context.handle(
          _estimatedMinutesMeta,
          estimatedMinutes.isAcceptableOrUnknown(
              data['estimated_minutes']!, _estimatedMinutesMeta));
    }
    if (data.containsKey('defer_count')) {
      context.handle(
          _deferCountMeta,
          deferCount.isAcceptableOrUnknown(
              data['defer_count']!, _deferCountMeta));
    }
    if (data.containsKey('deferred_from')) {
      context.handle(
          _deferredFromMeta,
          deferredFrom.isAcceptableOrUnknown(
              data['deferred_from']!, _deferredFromMeta));
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalTask map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalTask(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
      baseUpdatedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}base_updated_at']),
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
      deletedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}deleted_at']),
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      notes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}notes']),
      dueAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}due_at']),
      allDay: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}all_day'])!,
      priority: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}priority'])!,
      labelId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}label_id']),
      labelName: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}label_name']),
      labelColor: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}label_color']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      completedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}completed_at']),
      recurrenceJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}recurrence_json']),
      estimatedMinutes: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}estimated_minutes']),
      deferCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}defer_count'])!,
      deferredFrom: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}deferred_from']),
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $TasksTable createAlias(String alias) {
    return $TasksTable(attachedDatabase, alias);
  }
}

class LocalTask extends DataClass implements Insertable<LocalTask> {
  /// Client-minted UUIDv7 for anything the phone can create offline, so a
  /// retried create is a no-op rather than a duplicate.
  final String id;
  final DateTime updatedAt;

  /// Null until a pull fills it in: the row has never been reconciled against
  /// a server timestamp.
  final DateTime? baseUpdatedAt;

  /// What this device did that the server has not been told about, or null for
  /// a clean row. See [notPendingOp] before writing a filter over it.
  final String? pendingOp;
  final int pushAttempts;

  /// A delete keeps the row and never touches its status: the status is the
  /// only record of whether the thing was completed, cancelled or never dealt
  /// with, and the Deleted view exists to show exactly that.
  final DateTime? deletedAt;
  final String title;
  final String? notes;

  /// The moment the member chose. Null for a task with no date at all.
  final DateTime? dueAt;

  /// An all-day task has a date and no moment, so nothing alarms from it —
  /// see `core/notifications/alert_plan.dart`, which skips it rather than
  /// waking somebody at midnight.
  final bool allDay;

  /// 1 highest … 4 none, exactly as the server numbers them.
  final int priority;
  final String? labelId;
  final String? labelName;
  final String? labelColor;

  /// `open` | `completed` | `cancelled`. A delete never touches it: the status
  /// is the only record of whether the task was done, dropped or still
  /// waiting, and the Deleted view exists to show exactly that.
  final String status;
  final DateTime? completedAt;

  /// The recurrence *rule*, as the JSON the server sent:
  /// `{ dtstart, rrule, mode, exdates[] }`.
  ///
  /// A rule plus its exceptions, never expanded rows — the window is expanded
  /// on read. Storing occurrences would make a moved one an edit to the series
  /// instead of an override, and there is no bottom to a series.
  final String? recurrenceJson;
  final int? estimatedMinutes;
  final int deferCount;
  final DateTime? deferredFrom;

  /// `app` | `chat` | `extension` | `rhythm` — who created it.
  final String source;
  final DateTime createdAt;
  const LocalTask(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.title,
      this.notes,
      this.dueAt,
      required this.allDay,
      required this.priority,
      this.labelId,
      this.labelName,
      this.labelColor,
      required this.status,
      this.completedAt,
      this.recurrenceJson,
      this.estimatedMinutes,
      required this.deferCount,
      this.deferredFrom,
      required this.source,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    if (!nullToAbsent || baseUpdatedAt != null) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt);
    }
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<DateTime>(deletedAt);
    }
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    if (!nullToAbsent || dueAt != null) {
      map['due_at'] = Variable<DateTime>(dueAt);
    }
    map['all_day'] = Variable<bool>(allDay);
    map['priority'] = Variable<int>(priority);
    if (!nullToAbsent || labelId != null) {
      map['label_id'] = Variable<String>(labelId);
    }
    if (!nullToAbsent || labelName != null) {
      map['label_name'] = Variable<String>(labelName);
    }
    if (!nullToAbsent || labelColor != null) {
      map['label_color'] = Variable<String>(labelColor);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || completedAt != null) {
      map['completed_at'] = Variable<DateTime>(completedAt);
    }
    if (!nullToAbsent || recurrenceJson != null) {
      map['recurrence_json'] = Variable<String>(recurrenceJson);
    }
    if (!nullToAbsent || estimatedMinutes != null) {
      map['estimated_minutes'] = Variable<int>(estimatedMinutes);
    }
    map['defer_count'] = Variable<int>(deferCount);
    if (!nullToAbsent || deferredFrom != null) {
      map['deferred_from'] = Variable<DateTime>(deferredFrom);
    }
    map['source'] = Variable<String>(source);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  TasksCompanion toCompanion(bool nullToAbsent) {
    return TasksCompanion(
      id: Value(id),
      updatedAt: Value(updatedAt),
      baseUpdatedAt: baseUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(baseUpdatedAt),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      title: Value(title),
      notes:
          notes == null && nullToAbsent ? const Value.absent() : Value(notes),
      dueAt:
          dueAt == null && nullToAbsent ? const Value.absent() : Value(dueAt),
      allDay: Value(allDay),
      priority: Value(priority),
      labelId: labelId == null && nullToAbsent
          ? const Value.absent()
          : Value(labelId),
      labelName: labelName == null && nullToAbsent
          ? const Value.absent()
          : Value(labelName),
      labelColor: labelColor == null && nullToAbsent
          ? const Value.absent()
          : Value(labelColor),
      status: Value(status),
      completedAt: completedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(completedAt),
      recurrenceJson: recurrenceJson == null && nullToAbsent
          ? const Value.absent()
          : Value(recurrenceJson),
      estimatedMinutes: estimatedMinutes == null && nullToAbsent
          ? const Value.absent()
          : Value(estimatedMinutes),
      deferCount: Value(deferCount),
      deferredFrom: deferredFrom == null && nullToAbsent
          ? const Value.absent()
          : Value(deferredFrom),
      source: Value(source),
      createdAt: Value(createdAt),
    );
  }

  factory LocalTask.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalTask(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      title: serializer.fromJson<String>(json['title']),
      notes: serializer.fromJson<String?>(json['notes']),
      dueAt: serializer.fromJson<DateTime?>(json['dueAt']),
      allDay: serializer.fromJson<bool>(json['allDay']),
      priority: serializer.fromJson<int>(json['priority']),
      labelId: serializer.fromJson<String?>(json['labelId']),
      labelName: serializer.fromJson<String?>(json['labelName']),
      labelColor: serializer.fromJson<String?>(json['labelColor']),
      status: serializer.fromJson<String>(json['status']),
      completedAt: serializer.fromJson<DateTime?>(json['completedAt']),
      recurrenceJson: serializer.fromJson<String?>(json['recurrenceJson']),
      estimatedMinutes: serializer.fromJson<int?>(json['estimatedMinutes']),
      deferCount: serializer.fromJson<int>(json['deferCount']),
      deferredFrom: serializer.fromJson<DateTime?>(json['deferredFrom']),
      source: serializer.fromJson<String>(json['source']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'baseUpdatedAt': serializer.toJson<DateTime?>(baseUpdatedAt),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
      'deletedAt': serializer.toJson<DateTime?>(deletedAt),
      'title': serializer.toJson<String>(title),
      'notes': serializer.toJson<String?>(notes),
      'dueAt': serializer.toJson<DateTime?>(dueAt),
      'allDay': serializer.toJson<bool>(allDay),
      'priority': serializer.toJson<int>(priority),
      'labelId': serializer.toJson<String?>(labelId),
      'labelName': serializer.toJson<String?>(labelName),
      'labelColor': serializer.toJson<String?>(labelColor),
      'status': serializer.toJson<String>(status),
      'completedAt': serializer.toJson<DateTime?>(completedAt),
      'recurrenceJson': serializer.toJson<String?>(recurrenceJson),
      'estimatedMinutes': serializer.toJson<int?>(estimatedMinutes),
      'deferCount': serializer.toJson<int>(deferCount),
      'deferredFrom': serializer.toJson<DateTime?>(deferredFrom),
      'source': serializer.toJson<String>(source),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalTask copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? title,
          Value<String?> notes = const Value.absent(),
          Value<DateTime?> dueAt = const Value.absent(),
          bool? allDay,
          int? priority,
          Value<String?> labelId = const Value.absent(),
          Value<String?> labelName = const Value.absent(),
          Value<String?> labelColor = const Value.absent(),
          String? status,
          Value<DateTime?> completedAt = const Value.absent(),
          Value<String?> recurrenceJson = const Value.absent(),
          Value<int?> estimatedMinutes = const Value.absent(),
          int? deferCount,
          Value<DateTime?> deferredFrom = const Value.absent(),
          String? source,
          DateTime? createdAt}) =>
      LocalTask(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        title: title ?? this.title,
        notes: notes.present ? notes.value : this.notes,
        dueAt: dueAt.present ? dueAt.value : this.dueAt,
        allDay: allDay ?? this.allDay,
        priority: priority ?? this.priority,
        labelId: labelId.present ? labelId.value : this.labelId,
        labelName: labelName.present ? labelName.value : this.labelName,
        labelColor: labelColor.present ? labelColor.value : this.labelColor,
        status: status ?? this.status,
        completedAt: completedAt.present ? completedAt.value : this.completedAt,
        recurrenceJson:
            recurrenceJson.present ? recurrenceJson.value : this.recurrenceJson,
        estimatedMinutes: estimatedMinutes.present
            ? estimatedMinutes.value
            : this.estimatedMinutes,
        deferCount: deferCount ?? this.deferCount,
        deferredFrom:
            deferredFrom.present ? deferredFrom.value : this.deferredFrom,
        source: source ?? this.source,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalTask copyWithCompanion(TasksCompanion data) {
    return LocalTask(
      id: data.id.present ? data.id.value : this.id,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      baseUpdatedAt: data.baseUpdatedAt.present
          ? data.baseUpdatedAt.value
          : this.baseUpdatedAt,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      title: data.title.present ? data.title.value : this.title,
      notes: data.notes.present ? data.notes.value : this.notes,
      dueAt: data.dueAt.present ? data.dueAt.value : this.dueAt,
      allDay: data.allDay.present ? data.allDay.value : this.allDay,
      priority: data.priority.present ? data.priority.value : this.priority,
      labelId: data.labelId.present ? data.labelId.value : this.labelId,
      labelName: data.labelName.present ? data.labelName.value : this.labelName,
      labelColor:
          data.labelColor.present ? data.labelColor.value : this.labelColor,
      status: data.status.present ? data.status.value : this.status,
      completedAt:
          data.completedAt.present ? data.completedAt.value : this.completedAt,
      recurrenceJson: data.recurrenceJson.present
          ? data.recurrenceJson.value
          : this.recurrenceJson,
      estimatedMinutes: data.estimatedMinutes.present
          ? data.estimatedMinutes.value
          : this.estimatedMinutes,
      deferCount:
          data.deferCount.present ? data.deferCount.value : this.deferCount,
      deferredFrom: data.deferredFrom.present
          ? data.deferredFrom.value
          : this.deferredFrom,
      source: data.source.present ? data.source.value : this.source,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalTask(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('notes: $notes, ')
          ..write('dueAt: $dueAt, ')
          ..write('allDay: $allDay, ')
          ..write('priority: $priority, ')
          ..write('labelId: $labelId, ')
          ..write('labelName: $labelName, ')
          ..write('labelColor: $labelColor, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('estimatedMinutes: $estimatedMinutes, ')
          ..write('deferCount: $deferCount, ')
          ..write('deferredFrom: $deferredFrom, ')
          ..write('source: $source, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        title,
        notes,
        dueAt,
        allDay,
        priority,
        labelId,
        labelName,
        labelColor,
        status,
        completedAt,
        recurrenceJson,
        estimatedMinutes,
        deferCount,
        deferredFrom,
        source,
        createdAt
      ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalTask &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.title == this.title &&
          other.notes == this.notes &&
          other.dueAt == this.dueAt &&
          other.allDay == this.allDay &&
          other.priority == this.priority &&
          other.labelId == this.labelId &&
          other.labelName == this.labelName &&
          other.labelColor == this.labelColor &&
          other.status == this.status &&
          other.completedAt == this.completedAt &&
          other.recurrenceJson == this.recurrenceJson &&
          other.estimatedMinutes == this.estimatedMinutes &&
          other.deferCount == this.deferCount &&
          other.deferredFrom == this.deferredFrom &&
          other.source == this.source &&
          other.createdAt == this.createdAt);
}

class TasksCompanion extends UpdateCompanion<LocalTask> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> title;
  final Value<String?> notes;
  final Value<DateTime?> dueAt;
  final Value<bool> allDay;
  final Value<int> priority;
  final Value<String?> labelId;
  final Value<String?> labelName;
  final Value<String?> labelColor;
  final Value<String> status;
  final Value<DateTime?> completedAt;
  final Value<String?> recurrenceJson;
  final Value<int?> estimatedMinutes;
  final Value<int> deferCount;
  final Value<DateTime?> deferredFrom;
  final Value<String> source;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const TasksCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.title = const Value.absent(),
    this.notes = const Value.absent(),
    this.dueAt = const Value.absent(),
    this.allDay = const Value.absent(),
    this.priority = const Value.absent(),
    this.labelId = const Value.absent(),
    this.labelName = const Value.absent(),
    this.labelColor = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.estimatedMinutes = const Value.absent(),
    this.deferCount = const Value.absent(),
    this.deferredFrom = const Value.absent(),
    this.source = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TasksCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String title,
    this.notes = const Value.absent(),
    this.dueAt = const Value.absent(),
    this.allDay = const Value.absent(),
    this.priority = const Value.absent(),
    this.labelId = const Value.absent(),
    this.labelName = const Value.absent(),
    this.labelColor = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.estimatedMinutes = const Value.absent(),
    this.deferCount = const Value.absent(),
    this.deferredFrom = const Value.absent(),
    this.source = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        title = Value(title),
        createdAt = Value(createdAt);
  static Insertable<LocalTask> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? title,
    Expression<String>? notes,
    Expression<DateTime>? dueAt,
    Expression<bool>? allDay,
    Expression<int>? priority,
    Expression<String>? labelId,
    Expression<String>? labelName,
    Expression<String>? labelColor,
    Expression<String>? status,
    Expression<DateTime>? completedAt,
    Expression<String>? recurrenceJson,
    Expression<int>? estimatedMinutes,
    Expression<int>? deferCount,
    Expression<DateTime>? deferredFrom,
    Expression<String>? source,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (title != null) 'title': title,
      if (notes != null) 'notes': notes,
      if (dueAt != null) 'due_at': dueAt,
      if (allDay != null) 'all_day': allDay,
      if (priority != null) 'priority': priority,
      if (labelId != null) 'label_id': labelId,
      if (labelName != null) 'label_name': labelName,
      if (labelColor != null) 'label_color': labelColor,
      if (status != null) 'status': status,
      if (completedAt != null) 'completed_at': completedAt,
      if (recurrenceJson != null) 'recurrence_json': recurrenceJson,
      if (estimatedMinutes != null) 'estimated_minutes': estimatedMinutes,
      if (deferCount != null) 'defer_count': deferCount,
      if (deferredFrom != null) 'deferred_from': deferredFrom,
      if (source != null) 'source': source,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TasksCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? title,
      Value<String?>? notes,
      Value<DateTime?>? dueAt,
      Value<bool>? allDay,
      Value<int>? priority,
      Value<String?>? labelId,
      Value<String?>? labelName,
      Value<String?>? labelColor,
      Value<String>? status,
      Value<DateTime?>? completedAt,
      Value<String?>? recurrenceJson,
      Value<int?>? estimatedMinutes,
      Value<int>? deferCount,
      Value<DateTime?>? deferredFrom,
      Value<String>? source,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return TasksCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      title: title ?? this.title,
      notes: notes ?? this.notes,
      dueAt: dueAt ?? this.dueAt,
      allDay: allDay ?? this.allDay,
      priority: priority ?? this.priority,
      labelId: labelId ?? this.labelId,
      labelName: labelName ?? this.labelName,
      labelColor: labelColor ?? this.labelColor,
      status: status ?? this.status,
      completedAt: completedAt ?? this.completedAt,
      recurrenceJson: recurrenceJson ?? this.recurrenceJson,
      estimatedMinutes: estimatedMinutes ?? this.estimatedMinutes,
      deferCount: deferCount ?? this.deferCount,
      deferredFrom: deferredFrom ?? this.deferredFrom,
      source: source ?? this.source,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (baseUpdatedAt.present) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<DateTime>(deletedAt.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
    }
    if (dueAt.present) {
      map['due_at'] = Variable<DateTime>(dueAt.value);
    }
    if (allDay.present) {
      map['all_day'] = Variable<bool>(allDay.value);
    }
    if (priority.present) {
      map['priority'] = Variable<int>(priority.value);
    }
    if (labelId.present) {
      map['label_id'] = Variable<String>(labelId.value);
    }
    if (labelName.present) {
      map['label_name'] = Variable<String>(labelName.value);
    }
    if (labelColor.present) {
      map['label_color'] = Variable<String>(labelColor.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (completedAt.present) {
      map['completed_at'] = Variable<DateTime>(completedAt.value);
    }
    if (recurrenceJson.present) {
      map['recurrence_json'] = Variable<String>(recurrenceJson.value);
    }
    if (estimatedMinutes.present) {
      map['estimated_minutes'] = Variable<int>(estimatedMinutes.value);
    }
    if (deferCount.present) {
      map['defer_count'] = Variable<int>(deferCount.value);
    }
    if (deferredFrom.present) {
      map['deferred_from'] = Variable<DateTime>(deferredFrom.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TasksCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('notes: $notes, ')
          ..write('dueAt: $dueAt, ')
          ..write('allDay: $allDay, ')
          ..write('priority: $priority, ')
          ..write('labelId: $labelId, ')
          ..write('labelName: $labelName, ')
          ..write('labelColor: $labelColor, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('estimatedMinutes: $estimatedMinutes, ')
          ..write('deferCount: $deferCount, ')
          ..write('deferredFrom: $deferredFrom, ')
          ..write('source: $source, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RemindersTable extends Reminders
    with TableInfo<$RemindersTable, LocalReminder> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RemindersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _updatedAtMeta =
      const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>(
      'updated_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _baseUpdatedAtMeta =
      const VerificationMeta('baseUpdatedAt');
  @override
  late final GeneratedColumn<DateTime> baseUpdatedAt =
      GeneratedColumn<DateTime>('base_updated_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _pendingOpMeta =
      const VerificationMeta('pendingOp');
  @override
  late final GeneratedColumn<String> pendingOp = GeneratedColumn<String>(
      'pending_op', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _pushAttemptsMeta =
      const VerificationMeta('pushAttempts');
  @override
  late final GeneratedColumn<int> pushAttempts = GeneratedColumn<int>(
      'push_attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _deletedAtMeta =
      const VerificationMeta('deletedAt');
  @override
  late final GeneratedColumn<DateTime> deletedAt = GeneratedColumn<DateTime>(
      'deleted_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _remindAtMeta =
      const VerificationMeta('remindAt');
  @override
  late final GeneratedColumn<DateTime> remindAt = GeneratedColumn<DateTime>(
      'remind_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _leadTimesJsonMeta =
      const VerificationMeta('leadTimesJson');
  @override
  late final GeneratedColumn<String> leadTimesJson = GeneratedColumn<String>(
      'lead_times_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('active'));
  static const VerificationMeta _snoozedUntilMeta =
      const VerificationMeta('snoozedUntil');
  @override
  late final GeneratedColumn<DateTime> snoozedUntil = GeneratedColumn<DateTime>(
      'snoozed_until', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('app'));
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        title,
        remindAt,
        leadTimesJson,
        status,
        snoozedUntil,
        source,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'reminders';
  @override
  VerificationContext validateIntegrity(Insertable<LocalReminder> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta,
          updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('base_updated_at')) {
      context.handle(
          _baseUpdatedAtMeta,
          baseUpdatedAt.isAcceptableOrUnknown(
              data['base_updated_at']!, _baseUpdatedAtMeta));
    }
    if (data.containsKey('pending_op')) {
      context.handle(_pendingOpMeta,
          pendingOp.isAcceptableOrUnknown(data['pending_op']!, _pendingOpMeta));
    }
    if (data.containsKey('push_attempts')) {
      context.handle(
          _pushAttemptsMeta,
          pushAttempts.isAcceptableOrUnknown(
              data['push_attempts']!, _pushAttemptsMeta));
    }
    if (data.containsKey('deleted_at')) {
      context.handle(_deletedAtMeta,
          deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta));
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('remind_at')) {
      context.handle(_remindAtMeta,
          remindAt.isAcceptableOrUnknown(data['remind_at']!, _remindAtMeta));
    } else if (isInserting) {
      context.missing(_remindAtMeta);
    }
    if (data.containsKey('lead_times_json')) {
      context.handle(
          _leadTimesJsonMeta,
          leadTimesJson.isAcceptableOrUnknown(
              data['lead_times_json']!, _leadTimesJsonMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('snoozed_until')) {
      context.handle(
          _snoozedUntilMeta,
          snoozedUntil.isAcceptableOrUnknown(
              data['snoozed_until']!, _snoozedUntilMeta));
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta,
          createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalReminder map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalReminder(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      updatedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at'])!,
      baseUpdatedAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}base_updated_at']),
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
      deletedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}deleted_at']),
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      remindAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}remind_at'])!,
      leadTimesJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}lead_times_json'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      snoozedUntil: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}snoozed_until']),
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $RemindersTable createAlias(String alias) {
    return $RemindersTable(attachedDatabase, alias);
  }
}

class LocalReminder extends DataClass implements Insertable<LocalReminder> {
  /// Client-minted UUIDv7 for anything the phone can create offline, so a
  /// retried create is a no-op rather than a duplicate.
  final String id;
  final DateTime updatedAt;

  /// Null until a pull fills it in: the row has never been reconciled against
  /// a server timestamp.
  final DateTime? baseUpdatedAt;

  /// What this device did that the server has not been told about, or null for
  /// a clean row. See [notPendingOp] before writing a filter over it.
  final String? pendingOp;
  final int pushAttempts;

  /// A delete keeps the row and never touches its status: the status is the
  /// only record of whether the thing was completed, cancelled or never dealt
  /// with, and the Deleted view exists to show exactly that.
  final DateTime? deletedAt;
  final String title;

  /// The moment the member asked for. Never overwritten by a snooze.
  final DateTime remindAt;

  /// JSON array of offsets, e.g. `["1h","0m"]`. Empty means "the member's
  /// defaults", which live in [UserPreferences.leadTimesJson].
  final String leadTimesJson;

  /// `active` | `done` | `cancelled`.
  final String status;

  /// "Not now, in ten minutes" — a field of its own rather than a write to
  /// [remindAt], because the original moment is still the truth about what the
  /// member asked for. The alarm fires at `snoozedUntil ?? remindAt`, which is
  /// the same `effectiveAt` the server's aggregate plans from.
  final DateTime? snoozedUntil;
  final String source;
  final DateTime createdAt;
  const LocalReminder(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.title,
      required this.remindAt,
      required this.leadTimesJson,
      required this.status,
      this.snoozedUntil,
      required this.source,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['updated_at'] = Variable<DateTime>(updatedAt);
    if (!nullToAbsent || baseUpdatedAt != null) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt);
    }
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<DateTime>(deletedAt);
    }
    map['title'] = Variable<String>(title);
    map['remind_at'] = Variable<DateTime>(remindAt);
    map['lead_times_json'] = Variable<String>(leadTimesJson);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || snoozedUntil != null) {
      map['snoozed_until'] = Variable<DateTime>(snoozedUntil);
    }
    map['source'] = Variable<String>(source);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  RemindersCompanion toCompanion(bool nullToAbsent) {
    return RemindersCompanion(
      id: Value(id),
      updatedAt: Value(updatedAt),
      baseUpdatedAt: baseUpdatedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(baseUpdatedAt),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      title: Value(title),
      remindAt: Value(remindAt),
      leadTimesJson: Value(leadTimesJson),
      status: Value(status),
      snoozedUntil: snoozedUntil == null && nullToAbsent
          ? const Value.absent()
          : Value(snoozedUntil),
      source: Value(source),
      createdAt: Value(createdAt),
    );
  }

  factory LocalReminder.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalReminder(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      title: serializer.fromJson<String>(json['title']),
      remindAt: serializer.fromJson<DateTime>(json['remindAt']),
      leadTimesJson: serializer.fromJson<String>(json['leadTimesJson']),
      status: serializer.fromJson<String>(json['status']),
      snoozedUntil: serializer.fromJson<DateTime?>(json['snoozedUntil']),
      source: serializer.fromJson<String>(json['source']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'updatedAt': serializer.toJson<DateTime>(updatedAt),
      'baseUpdatedAt': serializer.toJson<DateTime?>(baseUpdatedAt),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
      'deletedAt': serializer.toJson<DateTime?>(deletedAt),
      'title': serializer.toJson<String>(title),
      'remindAt': serializer.toJson<DateTime>(remindAt),
      'leadTimesJson': serializer.toJson<String>(leadTimesJson),
      'status': serializer.toJson<String>(status),
      'snoozedUntil': serializer.toJson<DateTime?>(snoozedUntil),
      'source': serializer.toJson<String>(source),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalReminder copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? title,
          DateTime? remindAt,
          String? leadTimesJson,
          String? status,
          Value<DateTime?> snoozedUntil = const Value.absent(),
          String? source,
          DateTime? createdAt}) =>
      LocalReminder(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        title: title ?? this.title,
        remindAt: remindAt ?? this.remindAt,
        leadTimesJson: leadTimesJson ?? this.leadTimesJson,
        status: status ?? this.status,
        snoozedUntil:
            snoozedUntil.present ? snoozedUntil.value : this.snoozedUntil,
        source: source ?? this.source,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalReminder copyWithCompanion(RemindersCompanion data) {
    return LocalReminder(
      id: data.id.present ? data.id.value : this.id,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      baseUpdatedAt: data.baseUpdatedAt.present
          ? data.baseUpdatedAt.value
          : this.baseUpdatedAt,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      title: data.title.present ? data.title.value : this.title,
      remindAt: data.remindAt.present ? data.remindAt.value : this.remindAt,
      leadTimesJson: data.leadTimesJson.present
          ? data.leadTimesJson.value
          : this.leadTimesJson,
      status: data.status.present ? data.status.value : this.status,
      snoozedUntil: data.snoozedUntil.present
          ? data.snoozedUntil.value
          : this.snoozedUntil,
      source: data.source.present ? data.source.value : this.source,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalReminder(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('remindAt: $remindAt, ')
          ..write('leadTimesJson: $leadTimesJson, ')
          ..write('status: $status, ')
          ..write('snoozedUntil: $snoozedUntil, ')
          ..write('source: $source, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      id,
      updatedAt,
      baseUpdatedAt,
      pendingOp,
      pushAttempts,
      deletedAt,
      title,
      remindAt,
      leadTimesJson,
      status,
      snoozedUntil,
      source,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalReminder &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.title == this.title &&
          other.remindAt == this.remindAt &&
          other.leadTimesJson == this.leadTimesJson &&
          other.status == this.status &&
          other.snoozedUntil == this.snoozedUntil &&
          other.source == this.source &&
          other.createdAt == this.createdAt);
}

class RemindersCompanion extends UpdateCompanion<LocalReminder> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> title;
  final Value<DateTime> remindAt;
  final Value<String> leadTimesJson;
  final Value<String> status;
  final Value<DateTime?> snoozedUntil;
  final Value<String> source;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const RemindersCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.title = const Value.absent(),
    this.remindAt = const Value.absent(),
    this.leadTimesJson = const Value.absent(),
    this.status = const Value.absent(),
    this.snoozedUntil = const Value.absent(),
    this.source = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RemindersCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String title,
    required DateTime remindAt,
    this.leadTimesJson = const Value.absent(),
    this.status = const Value.absent(),
    this.snoozedUntil = const Value.absent(),
    this.source = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        title = Value(title),
        remindAt = Value(remindAt),
        createdAt = Value(createdAt);
  static Insertable<LocalReminder> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? title,
    Expression<DateTime>? remindAt,
    Expression<String>? leadTimesJson,
    Expression<String>? status,
    Expression<DateTime>? snoozedUntil,
    Expression<String>? source,
    Expression<DateTime>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (title != null) 'title': title,
      if (remindAt != null) 'remind_at': remindAt,
      if (leadTimesJson != null) 'lead_times_json': leadTimesJson,
      if (status != null) 'status': status,
      if (snoozedUntil != null) 'snoozed_until': snoozedUntil,
      if (source != null) 'source': source,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RemindersCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? title,
      Value<DateTime>? remindAt,
      Value<String>? leadTimesJson,
      Value<String>? status,
      Value<DateTime?>? snoozedUntil,
      Value<String>? source,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return RemindersCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      title: title ?? this.title,
      remindAt: remindAt ?? this.remindAt,
      leadTimesJson: leadTimesJson ?? this.leadTimesJson,
      status: status ?? this.status,
      snoozedUntil: snoozedUntil ?? this.snoozedUntil,
      source: source ?? this.source,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<DateTime>(updatedAt.value);
    }
    if (baseUpdatedAt.present) {
      map['base_updated_at'] = Variable<DateTime>(baseUpdatedAt.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<DateTime>(deletedAt.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (remindAt.present) {
      map['remind_at'] = Variable<DateTime>(remindAt.value);
    }
    if (leadTimesJson.present) {
      map['lead_times_json'] = Variable<String>(leadTimesJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (snoozedUntil.present) {
      map['snoozed_until'] = Variable<DateTime>(snoozedUntil.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RemindersCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('remindAt: $remindAt, ')
          ..write('leadTimesJson: $leadTimesJson, ')
          ..write('status: $status, ')
          ..write('snoozedUntil: $snoozedUntil, ')
          ..write('source: $source, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AlertsLocalTable extends AlertsLocal
    with TableInfo<$AlertsLocalTable, LocalAlert> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AlertsLocalTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
      'id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sourceKindMeta =
      const VerificationMeta('sourceKind');
  @override
  late final GeneratedColumn<String> sourceKind = GeneratedColumn<String>(
      'source_kind', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sourceIdMeta =
      const VerificationMeta('sourceId');
  @override
  late final GeneratedColumn<String> sourceId = GeneratedColumn<String>(
      'source_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _occurrenceAtMeta =
      const VerificationMeta('occurrenceAt');
  @override
  late final GeneratedColumn<DateTime> occurrenceAt = GeneratedColumn<DateTime>(
      'occurrence_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _labelMeta = const VerificationMeta('label');
  @override
  late final GeneratedColumn<String> label = GeneratedColumn<String>(
      'label', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _notifyAtMeta =
      const VerificationMeta('notifyAt');
  @override
  late final GeneratedColumn<DateTime> notifyAt = GeneratedColumn<DateTime>(
      'notify_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _bodyMeta = const VerificationMeta('body');
  @override
  late final GeneratedColumn<String> body = GeneratedColumn<String>(
      'body', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _deepLinkMeta =
      const VerificationMeta('deepLink');
  @override
  late final GeneratedColumn<String> deepLink = GeneratedColumn<String>(
      'deep_link', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _fetchedAtMeta =
      const VerificationMeta('fetchedAt');
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
      'fetched_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        sourceKind,
        sourceId,
        occurrenceAt,
        label,
        notifyAt,
        title,
        body,
        deepLink,
        fetchedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'alerts_local';
  @override
  VerificationContext validateIntegrity(Insertable<LocalAlert> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('source_kind')) {
      context.handle(
          _sourceKindMeta,
          sourceKind.isAcceptableOrUnknown(
              data['source_kind']!, _sourceKindMeta));
    } else if (isInserting) {
      context.missing(_sourceKindMeta);
    }
    if (data.containsKey('source_id')) {
      context.handle(_sourceIdMeta,
          sourceId.isAcceptableOrUnknown(data['source_id']!, _sourceIdMeta));
    } else if (isInserting) {
      context.missing(_sourceIdMeta);
    }
    if (data.containsKey('occurrence_at')) {
      context.handle(
          _occurrenceAtMeta,
          occurrenceAt.isAcceptableOrUnknown(
              data['occurrence_at']!, _occurrenceAtMeta));
    }
    if (data.containsKey('label')) {
      context.handle(
          _labelMeta, label.isAcceptableOrUnknown(data['label']!, _labelMeta));
    } else if (isInserting) {
      context.missing(_labelMeta);
    }
    if (data.containsKey('notify_at')) {
      context.handle(_notifyAtMeta,
          notifyAt.isAcceptableOrUnknown(data['notify_at']!, _notifyAtMeta));
    } else if (isInserting) {
      context.missing(_notifyAtMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('body')) {
      context.handle(
          _bodyMeta, body.isAcceptableOrUnknown(data['body']!, _bodyMeta));
    }
    if (data.containsKey('deep_link')) {
      context.handle(_deepLinkMeta,
          deepLink.isAcceptableOrUnknown(data['deep_link']!, _deepLinkMeta));
    }
    if (data.containsKey('fetched_at')) {
      context.handle(_fetchedAtMeta,
          fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta));
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalAlert map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalAlert(
      id: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      sourceKind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source_kind'])!,
      sourceId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source_id'])!,
      occurrenceAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}occurrence_at']),
      label: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}label'])!,
      notifyAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}notify_at'])!,
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      body: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}body'])!,
      deepLink: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}deep_link'])!,
      fetchedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}fetched_at'])!,
    );
  }

  @override
  $AlertsLocalTable createAlias(String alias) {
    return $AlertsLocalTable(attachedDatabase, alias);
  }
}

class LocalAlert extends DataClass implements Insertable<LocalAlert> {
  /// `kind|sourceId|occurrenceAt|label` — the server's own unique key for an
  /// alert, so the same alert pulled twice is one row, and the row a local
  /// task or reminder implies collides with the server's copy of it instead of
  /// double-notifying.
  final String id;

  /// `reminder` | `task` | `meeting` | `rhythm` | `suggestion`.
  final String sourceKind;
  final String sourceId;

  /// Which occurrence of a recurring source this is, or null for a one-off.
  final DateTime? occurrenceAt;

  /// `0m` | `1h` | `prep` | `evening` | `morning` | `suggestion`. Half of the
  /// notification id, so it has to be the server's own string rather than
  /// display text.
  final String label;
  final DateTime notifyAt;
  final String title;
  final String body;
  final String deepLink;

  /// When this mirror row was pulled. Not the alert's own time — this is about
  /// the copy, as on [Profiles].
  final DateTime fetchedAt;
  const LocalAlert(
      {required this.id,
      required this.sourceKind,
      required this.sourceId,
      this.occurrenceAt,
      required this.label,
      required this.notifyAt,
      required this.title,
      required this.body,
      required this.deepLink,
      required this.fetchedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['source_kind'] = Variable<String>(sourceKind);
    map['source_id'] = Variable<String>(sourceId);
    if (!nullToAbsent || occurrenceAt != null) {
      map['occurrence_at'] = Variable<DateTime>(occurrenceAt);
    }
    map['label'] = Variable<String>(label);
    map['notify_at'] = Variable<DateTime>(notifyAt);
    map['title'] = Variable<String>(title);
    map['body'] = Variable<String>(body);
    map['deep_link'] = Variable<String>(deepLink);
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  AlertsLocalCompanion toCompanion(bool nullToAbsent) {
    return AlertsLocalCompanion(
      id: Value(id),
      sourceKind: Value(sourceKind),
      sourceId: Value(sourceId),
      occurrenceAt: occurrenceAt == null && nullToAbsent
          ? const Value.absent()
          : Value(occurrenceAt),
      label: Value(label),
      notifyAt: Value(notifyAt),
      title: Value(title),
      body: Value(body),
      deepLink: Value(deepLink),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory LocalAlert.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalAlert(
      id: serializer.fromJson<String>(json['id']),
      sourceKind: serializer.fromJson<String>(json['sourceKind']),
      sourceId: serializer.fromJson<String>(json['sourceId']),
      occurrenceAt: serializer.fromJson<DateTime?>(json['occurrenceAt']),
      label: serializer.fromJson<String>(json['label']),
      notifyAt: serializer.fromJson<DateTime>(json['notifyAt']),
      title: serializer.fromJson<String>(json['title']),
      body: serializer.fromJson<String>(json['body']),
      deepLink: serializer.fromJson<String>(json['deepLink']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'sourceKind': serializer.toJson<String>(sourceKind),
      'sourceId': serializer.toJson<String>(sourceId),
      'occurrenceAt': serializer.toJson<DateTime?>(occurrenceAt),
      'label': serializer.toJson<String>(label),
      'notifyAt': serializer.toJson<DateTime>(notifyAt),
      'title': serializer.toJson<String>(title),
      'body': serializer.toJson<String>(body),
      'deepLink': serializer.toJson<String>(deepLink),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  LocalAlert copyWith(
          {String? id,
          String? sourceKind,
          String? sourceId,
          Value<DateTime?> occurrenceAt = const Value.absent(),
          String? label,
          DateTime? notifyAt,
          String? title,
          String? body,
          String? deepLink,
          DateTime? fetchedAt}) =>
      LocalAlert(
        id: id ?? this.id,
        sourceKind: sourceKind ?? this.sourceKind,
        sourceId: sourceId ?? this.sourceId,
        occurrenceAt:
            occurrenceAt.present ? occurrenceAt.value : this.occurrenceAt,
        label: label ?? this.label,
        notifyAt: notifyAt ?? this.notifyAt,
        title: title ?? this.title,
        body: body ?? this.body,
        deepLink: deepLink ?? this.deepLink,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );
  LocalAlert copyWithCompanion(AlertsLocalCompanion data) {
    return LocalAlert(
      id: data.id.present ? data.id.value : this.id,
      sourceKind:
          data.sourceKind.present ? data.sourceKind.value : this.sourceKind,
      sourceId: data.sourceId.present ? data.sourceId.value : this.sourceId,
      occurrenceAt: data.occurrenceAt.present
          ? data.occurrenceAt.value
          : this.occurrenceAt,
      label: data.label.present ? data.label.value : this.label,
      notifyAt: data.notifyAt.present ? data.notifyAt.value : this.notifyAt,
      title: data.title.present ? data.title.value : this.title,
      body: data.body.present ? data.body.value : this.body,
      deepLink: data.deepLink.present ? data.deepLink.value : this.deepLink,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalAlert(')
          ..write('id: $id, ')
          ..write('sourceKind: $sourceKind, ')
          ..write('sourceId: $sourceId, ')
          ..write('occurrenceAt: $occurrenceAt, ')
          ..write('label: $label, ')
          ..write('notifyAt: $notifyAt, ')
          ..write('title: $title, ')
          ..write('body: $body, ')
          ..write('deepLink: $deepLink, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, sourceKind, sourceId, occurrenceAt, label,
      notifyAt, title, body, deepLink, fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalAlert &&
          other.id == this.id &&
          other.sourceKind == this.sourceKind &&
          other.sourceId == this.sourceId &&
          other.occurrenceAt == this.occurrenceAt &&
          other.label == this.label &&
          other.notifyAt == this.notifyAt &&
          other.title == this.title &&
          other.body == this.body &&
          other.deepLink == this.deepLink &&
          other.fetchedAt == this.fetchedAt);
}

class AlertsLocalCompanion extends UpdateCompanion<LocalAlert> {
  final Value<String> id;
  final Value<String> sourceKind;
  final Value<String> sourceId;
  final Value<DateTime?> occurrenceAt;
  final Value<String> label;
  final Value<DateTime> notifyAt;
  final Value<String> title;
  final Value<String> body;
  final Value<String> deepLink;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const AlertsLocalCompanion({
    this.id = const Value.absent(),
    this.sourceKind = const Value.absent(),
    this.sourceId = const Value.absent(),
    this.occurrenceAt = const Value.absent(),
    this.label = const Value.absent(),
    this.notifyAt = const Value.absent(),
    this.title = const Value.absent(),
    this.body = const Value.absent(),
    this.deepLink = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AlertsLocalCompanion.insert({
    required String id,
    required String sourceKind,
    required String sourceId,
    this.occurrenceAt = const Value.absent(),
    required String label,
    required DateTime notifyAt,
    required String title,
    this.body = const Value.absent(),
    this.deepLink = const Value.absent(),
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        sourceKind = Value(sourceKind),
        sourceId = Value(sourceId),
        label = Value(label),
        notifyAt = Value(notifyAt),
        title = Value(title),
        fetchedAt = Value(fetchedAt);
  static Insertable<LocalAlert> custom({
    Expression<String>? id,
    Expression<String>? sourceKind,
    Expression<String>? sourceId,
    Expression<DateTime>? occurrenceAt,
    Expression<String>? label,
    Expression<DateTime>? notifyAt,
    Expression<String>? title,
    Expression<String>? body,
    Expression<String>? deepLink,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (sourceKind != null) 'source_kind': sourceKind,
      if (sourceId != null) 'source_id': sourceId,
      if (occurrenceAt != null) 'occurrence_at': occurrenceAt,
      if (label != null) 'label': label,
      if (notifyAt != null) 'notify_at': notifyAt,
      if (title != null) 'title': title,
      if (body != null) 'body': body,
      if (deepLink != null) 'deep_link': deepLink,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AlertsLocalCompanion copyWith(
      {Value<String>? id,
      Value<String>? sourceKind,
      Value<String>? sourceId,
      Value<DateTime?>? occurrenceAt,
      Value<String>? label,
      Value<DateTime>? notifyAt,
      Value<String>? title,
      Value<String>? body,
      Value<String>? deepLink,
      Value<DateTime>? fetchedAt,
      Value<int>? rowid}) {
    return AlertsLocalCompanion(
      id: id ?? this.id,
      sourceKind: sourceKind ?? this.sourceKind,
      sourceId: sourceId ?? this.sourceId,
      occurrenceAt: occurrenceAt ?? this.occurrenceAt,
      label: label ?? this.label,
      notifyAt: notifyAt ?? this.notifyAt,
      title: title ?? this.title,
      body: body ?? this.body,
      deepLink: deepLink ?? this.deepLink,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (sourceKind.present) {
      map['source_kind'] = Variable<String>(sourceKind.value);
    }
    if (sourceId.present) {
      map['source_id'] = Variable<String>(sourceId.value);
    }
    if (occurrenceAt.present) {
      map['occurrence_at'] = Variable<DateTime>(occurrenceAt.value);
    }
    if (label.present) {
      map['label'] = Variable<String>(label.value);
    }
    if (notifyAt.present) {
      map['notify_at'] = Variable<DateTime>(notifyAt.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (body.present) {
      map['body'] = Variable<String>(body.value);
    }
    if (deepLink.present) {
      map['deep_link'] = Variable<String>(deepLink.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<DateTime>(fetchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AlertsLocalCompanion(')
          ..write('id: $id, ')
          ..write('sourceKind: $sourceKind, ')
          ..write('sourceId: $sourceId, ')
          ..write('occurrenceAt: $occurrenceAt, ')
          ..write('label: $label, ')
          ..write('notifyAt: $notifyAt, ')
          ..write('title: $title, ')
          ..write('body: $body, ')
          ..write('deepLink: $deepLink, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $KeyValuesTable keyValues = $KeyValuesTable(this);
  late final $ProfilesTable profiles = $ProfilesTable(this);
  late final $UserPreferencesTable userPreferences =
      $UserPreferencesTable(this);
  late final $LabelsTable labels = $LabelsTable(this);
  late final $TasksTable tasks = $TasksTable(this);
  late final $RemindersTable reminders = $RemindersTable(this);
  late final $AlertsLocalTable alertsLocal = $AlertsLocalTable(this);
  late final Index labelsSort =
      Index('labels_sort', 'CREATE INDEX labels_sort ON labels (sort_order)');
  late final Index labelsPending = Index(
      'labels_pending', 'CREATE INDEX labels_pending ON labels (pending_op)');
  late final Index tasksDue =
      Index('tasks_due', 'CREATE INDEX tasks_due ON tasks (due_at)');
  late final Index tasksStatusDue = Index('tasks_status_due',
      'CREATE INDEX tasks_status_due ON tasks (status, due_at)');
  late final Index tasksLabel =
      Index('tasks_label', 'CREATE INDEX tasks_label ON tasks (label_id)');
  late final Index tasksPending = Index(
      'tasks_pending', 'CREATE INDEX tasks_pending ON tasks (pending_op)');
  late final Index remindersRemindAt = Index('reminders_remind_at',
      'CREATE INDEX reminders_remind_at ON reminders (remind_at)');
  late final Index remindersPending = Index('reminders_pending',
      'CREATE INDEX reminders_pending ON reminders (pending_op)');
  late final Index alertsLocalNotifyAt = Index('alerts_local_notify_at',
      'CREATE INDEX alerts_local_notify_at ON alerts_local (notify_at)');
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
        keyValues,
        profiles,
        userPreferences,
        labels,
        tasks,
        reminders,
        alertsLocal,
        labelsSort,
        labelsPending,
        tasksDue,
        tasksStatusDue,
        tasksLabel,
        tasksPending,
        remindersRemindAt,
        remindersPending,
        alertsLocalNotifyAt
      ];
  @override
  DriftDatabaseOptions get options =>
      const DriftDatabaseOptions(storeDateTimeAsText: true);
}

typedef $$KeyValuesTableCreateCompanionBuilder = KeyValuesCompanion Function({
  required String key,
  required String value,
  Value<int> rowid,
});
typedef $$KeyValuesTableUpdateCompanionBuilder = KeyValuesCompanion Function({
  Value<String> key,
  Value<String> value,
  Value<int> rowid,
});

class $$KeyValuesTableFilterComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnFilters(column));
}

class $$KeyValuesTableOrderingComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
      column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get value => $composableBuilder(
      column: $table.value, builder: (column) => ColumnOrderings(column));
}

class $$KeyValuesTableAnnotationComposer
    extends Composer<_$AppDatabase, $KeyValuesTable> {
  $$KeyValuesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get value =>
      $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$KeyValuesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $KeyValuesTable,
    KeyValue,
    $$KeyValuesTableFilterComposer,
    $$KeyValuesTableOrderingComposer,
    $$KeyValuesTableAnnotationComposer,
    $$KeyValuesTableCreateCompanionBuilder,
    $$KeyValuesTableUpdateCompanionBuilder,
    (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
    KeyValue,
    PrefetchHooks Function()> {
  $$KeyValuesTableTableManager(_$AppDatabase db, $KeyValuesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$KeyValuesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$KeyValuesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$KeyValuesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> value = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              KeyValuesCompanion(
            key: key,
            value: value,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String key,
            required String value,
            Value<int> rowid = const Value.absent(),
          }) =>
              KeyValuesCompanion.insert(
            key: key,
            value: value,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$KeyValuesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $KeyValuesTable,
    KeyValue,
    $$KeyValuesTableFilterComposer,
    $$KeyValuesTableOrderingComposer,
    $$KeyValuesTableAnnotationComposer,
    $$KeyValuesTableCreateCompanionBuilder,
    $$KeyValuesTableUpdateCompanionBuilder,
    (KeyValue, BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>),
    KeyValue,
    PrefetchHooks Function()>;
typedef $$ProfilesTableCreateCompanionBuilder = ProfilesCompanion Function({
  required String userId,
  Value<String?> displayName,
  Value<String?> photoPath,
  required String timezone,
  required String locale,
  Value<String> metricsJson,
  Value<String> foodLikesJson,
  Value<String> foodDislikesJson,
  Value<String> allergiesJson,
  Value<String> symptomsJson,
  Value<DateTime?> onboardingCompletedAt,
  required DateTime fetchedAt,
  Value<int> rowid,
});
typedef $$ProfilesTableUpdateCompanionBuilder = ProfilesCompanion Function({
  Value<String> userId,
  Value<String?> displayName,
  Value<String?> photoPath,
  Value<String> timezone,
  Value<String> locale,
  Value<String> metricsJson,
  Value<String> foodLikesJson,
  Value<String> foodDislikesJson,
  Value<String> allergiesJson,
  Value<String> symptomsJson,
  Value<DateTime?> onboardingCompletedAt,
  Value<DateTime> fetchedAt,
  Value<int> rowid,
});

class $$ProfilesTableFilterComposer
    extends Composer<_$AppDatabase, $ProfilesTable> {
  $$ProfilesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get displayName => $composableBuilder(
      column: $table.displayName, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get photoPath => $composableBuilder(
      column: $table.photoPath, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get timezone => $composableBuilder(
      column: $table.timezone, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get locale => $composableBuilder(
      column: $table.locale, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get metricsJson => $composableBuilder(
      column: $table.metricsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get foodLikesJson => $composableBuilder(
      column: $table.foodLikesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get foodDislikesJson => $composableBuilder(
      column: $table.foodDislikesJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get allergiesJson => $composableBuilder(
      column: $table.allergiesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get symptomsJson => $composableBuilder(
      column: $table.symptomsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get onboardingCompletedAt => $composableBuilder(
      column: $table.onboardingCompletedAt,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnFilters(column));
}

class $$ProfilesTableOrderingComposer
    extends Composer<_$AppDatabase, $ProfilesTable> {
  $$ProfilesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get displayName => $composableBuilder(
      column: $table.displayName, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get photoPath => $composableBuilder(
      column: $table.photoPath, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get timezone => $composableBuilder(
      column: $table.timezone, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get locale => $composableBuilder(
      column: $table.locale, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get metricsJson => $composableBuilder(
      column: $table.metricsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get foodLikesJson => $composableBuilder(
      column: $table.foodLikesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get foodDislikesJson => $composableBuilder(
      column: $table.foodDislikesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get allergiesJson => $composableBuilder(
      column: $table.allergiesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get symptomsJson => $composableBuilder(
      column: $table.symptomsJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get onboardingCompletedAt => $composableBuilder(
      column: $table.onboardingCompletedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnOrderings(column));
}

class $$ProfilesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ProfilesTable> {
  $$ProfilesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get displayName => $composableBuilder(
      column: $table.displayName, builder: (column) => column);

  GeneratedColumn<String> get photoPath =>
      $composableBuilder(column: $table.photoPath, builder: (column) => column);

  GeneratedColumn<String> get timezone =>
      $composableBuilder(column: $table.timezone, builder: (column) => column);

  GeneratedColumn<String> get locale =>
      $composableBuilder(column: $table.locale, builder: (column) => column);

  GeneratedColumn<String> get metricsJson => $composableBuilder(
      column: $table.metricsJson, builder: (column) => column);

  GeneratedColumn<String> get foodLikesJson => $composableBuilder(
      column: $table.foodLikesJson, builder: (column) => column);

  GeneratedColumn<String> get foodDislikesJson => $composableBuilder(
      column: $table.foodDislikesJson, builder: (column) => column);

  GeneratedColumn<String> get allergiesJson => $composableBuilder(
      column: $table.allergiesJson, builder: (column) => column);

  GeneratedColumn<String> get symptomsJson => $composableBuilder(
      column: $table.symptomsJson, builder: (column) => column);

  GeneratedColumn<DateTime> get onboardingCompletedAt => $composableBuilder(
      column: $table.onboardingCompletedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$ProfilesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ProfilesTable,
    Profile,
    $$ProfilesTableFilterComposer,
    $$ProfilesTableOrderingComposer,
    $$ProfilesTableAnnotationComposer,
    $$ProfilesTableCreateCompanionBuilder,
    $$ProfilesTableUpdateCompanionBuilder,
    (Profile, BaseReferences<_$AppDatabase, $ProfilesTable, Profile>),
    Profile,
    PrefetchHooks Function()> {
  $$ProfilesTableTableManager(_$AppDatabase db, $ProfilesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ProfilesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ProfilesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ProfilesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> userId = const Value.absent(),
            Value<String?> displayName = const Value.absent(),
            Value<String?> photoPath = const Value.absent(),
            Value<String> timezone = const Value.absent(),
            Value<String> locale = const Value.absent(),
            Value<String> metricsJson = const Value.absent(),
            Value<String> foodLikesJson = const Value.absent(),
            Value<String> foodDislikesJson = const Value.absent(),
            Value<String> allergiesJson = const Value.absent(),
            Value<String> symptomsJson = const Value.absent(),
            Value<DateTime?> onboardingCompletedAt = const Value.absent(),
            Value<DateTime> fetchedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ProfilesCompanion(
            userId: userId,
            displayName: displayName,
            photoPath: photoPath,
            timezone: timezone,
            locale: locale,
            metricsJson: metricsJson,
            foodLikesJson: foodLikesJson,
            foodDislikesJson: foodDislikesJson,
            allergiesJson: allergiesJson,
            symptomsJson: symptomsJson,
            onboardingCompletedAt: onboardingCompletedAt,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String userId,
            Value<String?> displayName = const Value.absent(),
            Value<String?> photoPath = const Value.absent(),
            required String timezone,
            required String locale,
            Value<String> metricsJson = const Value.absent(),
            Value<String> foodLikesJson = const Value.absent(),
            Value<String> foodDislikesJson = const Value.absent(),
            Value<String> allergiesJson = const Value.absent(),
            Value<String> symptomsJson = const Value.absent(),
            Value<DateTime?> onboardingCompletedAt = const Value.absent(),
            required DateTime fetchedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              ProfilesCompanion.insert(
            userId: userId,
            displayName: displayName,
            photoPath: photoPath,
            timezone: timezone,
            locale: locale,
            metricsJson: metricsJson,
            foodLikesJson: foodLikesJson,
            foodDislikesJson: foodDislikesJson,
            allergiesJson: allergiesJson,
            symptomsJson: symptomsJson,
            onboardingCompletedAt: onboardingCompletedAt,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ProfilesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ProfilesTable,
    Profile,
    $$ProfilesTableFilterComposer,
    $$ProfilesTableOrderingComposer,
    $$ProfilesTableAnnotationComposer,
    $$ProfilesTableCreateCompanionBuilder,
    $$ProfilesTableUpdateCompanionBuilder,
    (Profile, BaseReferences<_$AppDatabase, $ProfilesTable, Profile>),
    Profile,
    PrefetchHooks Function()>;
typedef $$UserPreferencesTableCreateCompanionBuilder = UserPreferencesCompanion
    Function({
  required String userId,
  required String planTomorrowTime,
  required String endOfDayTime,
  required String morningBriefingTime,
  required String nextPracticeCutoff,
  Value<String> leadTimesJson,
  required String quietFrom,
  required String quietTo,
  required String weekStartsOn,
  required bool checkinEnabled,
  required int meetingDurationMin,
  required String mealMode,
  required bool aiSuggestions,
  required DateTime fetchedAt,
  Value<int> rowid,
});
typedef $$UserPreferencesTableUpdateCompanionBuilder = UserPreferencesCompanion
    Function({
  Value<String> userId,
  Value<String> planTomorrowTime,
  Value<String> endOfDayTime,
  Value<String> morningBriefingTime,
  Value<String> nextPracticeCutoff,
  Value<String> leadTimesJson,
  Value<String> quietFrom,
  Value<String> quietTo,
  Value<String> weekStartsOn,
  Value<bool> checkinEnabled,
  Value<int> meetingDurationMin,
  Value<String> mealMode,
  Value<bool> aiSuggestions,
  Value<DateTime> fetchedAt,
  Value<int> rowid,
});

class $$UserPreferencesTableFilterComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get planTomorrowTime => $composableBuilder(
      column: $table.planTomorrowTime,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get endOfDayTime => $composableBuilder(
      column: $table.endOfDayTime, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get morningBriefingTime => $composableBuilder(
      column: $table.morningBriefingTime,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nextPracticeCutoff => $composableBuilder(
      column: $table.nextPracticeCutoff,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get quietFrom => $composableBuilder(
      column: $table.quietFrom, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get quietTo => $composableBuilder(
      column: $table.quietTo, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get weekStartsOn => $composableBuilder(
      column: $table.weekStartsOn, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get checkinEnabled => $composableBuilder(
      column: $table.checkinEnabled,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get meetingDurationMin => $composableBuilder(
      column: $table.meetingDurationMin,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mealMode => $composableBuilder(
      column: $table.mealMode, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get aiSuggestions => $composableBuilder(
      column: $table.aiSuggestions, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnFilters(column));
}

class $$UserPreferencesTableOrderingComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get planTomorrowTime => $composableBuilder(
      column: $table.planTomorrowTime,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get endOfDayTime => $composableBuilder(
      column: $table.endOfDayTime,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get morningBriefingTime => $composableBuilder(
      column: $table.morningBriefingTime,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nextPracticeCutoff => $composableBuilder(
      column: $table.nextPracticeCutoff,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get quietFrom => $composableBuilder(
      column: $table.quietFrom, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get quietTo => $composableBuilder(
      column: $table.quietTo, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get weekStartsOn => $composableBuilder(
      column: $table.weekStartsOn,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get checkinEnabled => $composableBuilder(
      column: $table.checkinEnabled,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get meetingDurationMin => $composableBuilder(
      column: $table.meetingDurationMin,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mealMode => $composableBuilder(
      column: $table.mealMode, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get aiSuggestions => $composableBuilder(
      column: $table.aiSuggestions,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnOrderings(column));
}

class $$UserPreferencesTableAnnotationComposer
    extends Composer<_$AppDatabase, $UserPreferencesTable> {
  $$UserPreferencesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get planTomorrowTime => $composableBuilder(
      column: $table.planTomorrowTime, builder: (column) => column);

  GeneratedColumn<String> get endOfDayTime => $composableBuilder(
      column: $table.endOfDayTime, builder: (column) => column);

  GeneratedColumn<String> get morningBriefingTime => $composableBuilder(
      column: $table.morningBriefingTime, builder: (column) => column);

  GeneratedColumn<String> get nextPracticeCutoff => $composableBuilder(
      column: $table.nextPracticeCutoff, builder: (column) => column);

  GeneratedColumn<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson, builder: (column) => column);

  GeneratedColumn<String> get quietFrom =>
      $composableBuilder(column: $table.quietFrom, builder: (column) => column);

  GeneratedColumn<String> get quietTo =>
      $composableBuilder(column: $table.quietTo, builder: (column) => column);

  GeneratedColumn<String> get weekStartsOn => $composableBuilder(
      column: $table.weekStartsOn, builder: (column) => column);

  GeneratedColumn<bool> get checkinEnabled => $composableBuilder(
      column: $table.checkinEnabled, builder: (column) => column);

  GeneratedColumn<int> get meetingDurationMin => $composableBuilder(
      column: $table.meetingDurationMin, builder: (column) => column);

  GeneratedColumn<String> get mealMode =>
      $composableBuilder(column: $table.mealMode, builder: (column) => column);

  GeneratedColumn<bool> get aiSuggestions => $composableBuilder(
      column: $table.aiSuggestions, builder: (column) => column);

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$UserPreferencesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $UserPreferencesTable,
    UserPreference,
    $$UserPreferencesTableFilterComposer,
    $$UserPreferencesTableOrderingComposer,
    $$UserPreferencesTableAnnotationComposer,
    $$UserPreferencesTableCreateCompanionBuilder,
    $$UserPreferencesTableUpdateCompanionBuilder,
    (
      UserPreference,
      BaseReferences<_$AppDatabase, $UserPreferencesTable, UserPreference>
    ),
    UserPreference,
    PrefetchHooks Function()> {
  $$UserPreferencesTableTableManager(
      _$AppDatabase db, $UserPreferencesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$UserPreferencesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$UserPreferencesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$UserPreferencesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> userId = const Value.absent(),
            Value<String> planTomorrowTime = const Value.absent(),
            Value<String> endOfDayTime = const Value.absent(),
            Value<String> morningBriefingTime = const Value.absent(),
            Value<String> nextPracticeCutoff = const Value.absent(),
            Value<String> leadTimesJson = const Value.absent(),
            Value<String> quietFrom = const Value.absent(),
            Value<String> quietTo = const Value.absent(),
            Value<String> weekStartsOn = const Value.absent(),
            Value<bool> checkinEnabled = const Value.absent(),
            Value<int> meetingDurationMin = const Value.absent(),
            Value<String> mealMode = const Value.absent(),
            Value<bool> aiSuggestions = const Value.absent(),
            Value<DateTime> fetchedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              UserPreferencesCompanion(
            userId: userId,
            planTomorrowTime: planTomorrowTime,
            endOfDayTime: endOfDayTime,
            morningBriefingTime: morningBriefingTime,
            nextPracticeCutoff: nextPracticeCutoff,
            leadTimesJson: leadTimesJson,
            quietFrom: quietFrom,
            quietTo: quietTo,
            weekStartsOn: weekStartsOn,
            checkinEnabled: checkinEnabled,
            meetingDurationMin: meetingDurationMin,
            mealMode: mealMode,
            aiSuggestions: aiSuggestions,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String userId,
            required String planTomorrowTime,
            required String endOfDayTime,
            required String morningBriefingTime,
            required String nextPracticeCutoff,
            Value<String> leadTimesJson = const Value.absent(),
            required String quietFrom,
            required String quietTo,
            required String weekStartsOn,
            required bool checkinEnabled,
            required int meetingDurationMin,
            required String mealMode,
            required bool aiSuggestions,
            required DateTime fetchedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              UserPreferencesCompanion.insert(
            userId: userId,
            planTomorrowTime: planTomorrowTime,
            endOfDayTime: endOfDayTime,
            morningBriefingTime: morningBriefingTime,
            nextPracticeCutoff: nextPracticeCutoff,
            leadTimesJson: leadTimesJson,
            quietFrom: quietFrom,
            quietTo: quietTo,
            weekStartsOn: weekStartsOn,
            checkinEnabled: checkinEnabled,
            meetingDurationMin: meetingDurationMin,
            mealMode: mealMode,
            aiSuggestions: aiSuggestions,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$UserPreferencesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $UserPreferencesTable,
    UserPreference,
    $$UserPreferencesTableFilterComposer,
    $$UserPreferencesTableOrderingComposer,
    $$UserPreferencesTableAnnotationComposer,
    $$UserPreferencesTableCreateCompanionBuilder,
    $$UserPreferencesTableUpdateCompanionBuilder,
    (
      UserPreference,
      BaseReferences<_$AppDatabase, $UserPreferencesTable, UserPreference>
    ),
    UserPreference,
    PrefetchHooks Function()>;
typedef $$LabelsTableCreateCompanionBuilder = LabelsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String name,
  required String color,
  Value<int> sortOrder,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$LabelsTableUpdateCompanionBuilder = LabelsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> name,
  Value<String> color,
  Value<int> sortOrder,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$LabelsTableFilterComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get color => $composableBuilder(
      column: $table.color, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get sortOrder => $composableBuilder(
      column: $table.sortOrder, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$LabelsTableOrderingComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get color => $composableBuilder(
      column: $table.color, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get sortOrder => $composableBuilder(
      column: $table.sortOrder, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$LabelsTableAnnotationComposer
    extends Composer<_$AppDatabase, $LabelsTable> {
  $$LabelsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);

  GeneratedColumn<DateTime> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get color =>
      $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<int> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$LabelsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $LabelsTable,
    LocalLabel,
    $$LabelsTableFilterComposer,
    $$LabelsTableOrderingComposer,
    $$LabelsTableAnnotationComposer,
    $$LabelsTableCreateCompanionBuilder,
    $$LabelsTableUpdateCompanionBuilder,
    (LocalLabel, BaseReferences<_$AppDatabase, $LabelsTable, LocalLabel>),
    LocalLabel,
    PrefetchHooks Function()> {
  $$LabelsTableTableManager(_$AppDatabase db, $LabelsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LabelsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LabelsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LabelsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> color = const Value.absent(),
            Value<int> sortOrder = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              LabelsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            name: name,
            color: color,
            sortOrder: sortOrder,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required DateTime updatedAt,
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            required String name,
            required String color,
            Value<int> sortOrder = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              LabelsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            name: name,
            color: color,
            sortOrder: sortOrder,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$LabelsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $LabelsTable,
    LocalLabel,
    $$LabelsTableFilterComposer,
    $$LabelsTableOrderingComposer,
    $$LabelsTableAnnotationComposer,
    $$LabelsTableCreateCompanionBuilder,
    $$LabelsTableUpdateCompanionBuilder,
    (LocalLabel, BaseReferences<_$AppDatabase, $LabelsTable, LocalLabel>),
    LocalLabel,
    PrefetchHooks Function()>;
typedef $$TasksTableCreateCompanionBuilder = TasksCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String title,
  Value<String?> notes,
  Value<DateTime?> dueAt,
  Value<bool> allDay,
  Value<int> priority,
  Value<String?> labelId,
  Value<String?> labelName,
  Value<String?> labelColor,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String?> recurrenceJson,
  Value<int?> estimatedMinutes,
  Value<int> deferCount,
  Value<DateTime?> deferredFrom,
  Value<String> source,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$TasksTableUpdateCompanionBuilder = TasksCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> title,
  Value<String?> notes,
  Value<DateTime?> dueAt,
  Value<bool> allDay,
  Value<int> priority,
  Value<String?> labelId,
  Value<String?> labelName,
  Value<String?> labelColor,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String?> recurrenceJson,
  Value<int?> estimatedMinutes,
  Value<int> deferCount,
  Value<DateTime?> deferredFrom,
  Value<String> source,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$TasksTableFilterComposer extends Composer<_$AppDatabase, $TasksTable> {
  $$TasksTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get dueAt => $composableBuilder(
      column: $table.dueAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get priority => $composableBuilder(
      column: $table.priority, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get labelId => $composableBuilder(
      column: $table.labelId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get labelName => $composableBuilder(
      column: $table.labelName, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get labelColor => $composableBuilder(
      column: $table.labelColor, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get estimatedMinutes => $composableBuilder(
      column: $table.estimatedMinutes,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get deferCount => $composableBuilder(
      column: $table.deferCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get deferredFrom => $composableBuilder(
      column: $table.deferredFrom, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$TasksTableOrderingComposer
    extends Composer<_$AppDatabase, $TasksTable> {
  $$TasksTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get dueAt => $composableBuilder(
      column: $table.dueAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get priority => $composableBuilder(
      column: $table.priority, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get labelId => $composableBuilder(
      column: $table.labelId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get labelName => $composableBuilder(
      column: $table.labelName, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get labelColor => $composableBuilder(
      column: $table.labelColor, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get estimatedMinutes => $composableBuilder(
      column: $table.estimatedMinutes,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get deferCount => $composableBuilder(
      column: $table.deferCount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get deferredFrom => $composableBuilder(
      column: $table.deferredFrom,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$TasksTableAnnotationComposer
    extends Composer<_$AppDatabase, $TasksTable> {
  $$TasksTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);

  GeneratedColumn<DateTime> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<DateTime> get dueAt =>
      $composableBuilder(column: $table.dueAt, builder: (column) => column);

  GeneratedColumn<bool> get allDay =>
      $composableBuilder(column: $table.allDay, builder: (column) => column);

  GeneratedColumn<int> get priority =>
      $composableBuilder(column: $table.priority, builder: (column) => column);

  GeneratedColumn<String> get labelId =>
      $composableBuilder(column: $table.labelId, builder: (column) => column);

  GeneratedColumn<String> get labelName =>
      $composableBuilder(column: $table.labelName, builder: (column) => column);

  GeneratedColumn<String> get labelColor => $composableBuilder(
      column: $table.labelColor, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => column);

  GeneratedColumn<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson, builder: (column) => column);

  GeneratedColumn<int> get estimatedMinutes => $composableBuilder(
      column: $table.estimatedMinutes, builder: (column) => column);

  GeneratedColumn<int> get deferCount => $composableBuilder(
      column: $table.deferCount, builder: (column) => column);

  GeneratedColumn<DateTime> get deferredFrom => $composableBuilder(
      column: $table.deferredFrom, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$TasksTableTableManager extends RootTableManager<
    _$AppDatabase,
    $TasksTable,
    LocalTask,
    $$TasksTableFilterComposer,
    $$TasksTableOrderingComposer,
    $$TasksTableAnnotationComposer,
    $$TasksTableCreateCompanionBuilder,
    $$TasksTableUpdateCompanionBuilder,
    (LocalTask, BaseReferences<_$AppDatabase, $TasksTable, LocalTask>),
    LocalTask,
    PrefetchHooks Function()> {
  $$TasksTableTableManager(_$AppDatabase db, $TasksTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$TasksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$TasksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$TasksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<DateTime?> dueAt = const Value.absent(),
            Value<bool> allDay = const Value.absent(),
            Value<int> priority = const Value.absent(),
            Value<String?> labelId = const Value.absent(),
            Value<String?> labelName = const Value.absent(),
            Value<String?> labelColor = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<int?> estimatedMinutes = const Value.absent(),
            Value<int> deferCount = const Value.absent(),
            Value<DateTime?> deferredFrom = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              TasksCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            notes: notes,
            dueAt: dueAt,
            allDay: allDay,
            priority: priority,
            labelId: labelId,
            labelName: labelName,
            labelColor: labelColor,
            status: status,
            completedAt: completedAt,
            recurrenceJson: recurrenceJson,
            estimatedMinutes: estimatedMinutes,
            deferCount: deferCount,
            deferredFrom: deferredFrom,
            source: source,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required DateTime updatedAt,
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            required String title,
            Value<String?> notes = const Value.absent(),
            Value<DateTime?> dueAt = const Value.absent(),
            Value<bool> allDay = const Value.absent(),
            Value<int> priority = const Value.absent(),
            Value<String?> labelId = const Value.absent(),
            Value<String?> labelName = const Value.absent(),
            Value<String?> labelColor = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<int?> estimatedMinutes = const Value.absent(),
            Value<int> deferCount = const Value.absent(),
            Value<DateTime?> deferredFrom = const Value.absent(),
            Value<String> source = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              TasksCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            notes: notes,
            dueAt: dueAt,
            allDay: allDay,
            priority: priority,
            labelId: labelId,
            labelName: labelName,
            labelColor: labelColor,
            status: status,
            completedAt: completedAt,
            recurrenceJson: recurrenceJson,
            estimatedMinutes: estimatedMinutes,
            deferCount: deferCount,
            deferredFrom: deferredFrom,
            source: source,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$TasksTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $TasksTable,
    LocalTask,
    $$TasksTableFilterComposer,
    $$TasksTableOrderingComposer,
    $$TasksTableAnnotationComposer,
    $$TasksTableCreateCompanionBuilder,
    $$TasksTableUpdateCompanionBuilder,
    (LocalTask, BaseReferences<_$AppDatabase, $TasksTable, LocalTask>),
    LocalTask,
    PrefetchHooks Function()>;
typedef $$RemindersTableCreateCompanionBuilder = RemindersCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String title,
  required DateTime remindAt,
  Value<String> leadTimesJson,
  Value<String> status,
  Value<DateTime?> snoozedUntil,
  Value<String> source,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$RemindersTableUpdateCompanionBuilder = RemindersCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> title,
  Value<DateTime> remindAt,
  Value<String> leadTimesJson,
  Value<String> status,
  Value<DateTime?> snoozedUntil,
  Value<String> source,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$RemindersTableFilterComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get remindAt => $composableBuilder(
      column: $table.remindAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get snoozedUntil => $composableBuilder(
      column: $table.snoozedUntil, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$RemindersTableOrderingComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get deletedAt => $composableBuilder(
      column: $table.deletedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get remindAt => $composableBuilder(
      column: $table.remindAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get snoozedUntil => $composableBuilder(
      column: $table.snoozedUntil,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$RemindersTableAnnotationComposer
    extends Composer<_$AppDatabase, $RemindersTable> {
  $$RemindersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<DateTime> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get baseUpdatedAt => $composableBuilder(
      column: $table.baseUpdatedAt, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);

  GeneratedColumn<DateTime> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<DateTime> get remindAt =>
      $composableBuilder(column: $table.remindAt, builder: (column) => column);

  GeneratedColumn<String> get leadTimesJson => $composableBuilder(
      column: $table.leadTimesJson, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get snoozedUntil => $composableBuilder(
      column: $table.snoozedUntil, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$RemindersTableTableManager extends RootTableManager<
    _$AppDatabase,
    $RemindersTable,
    LocalReminder,
    $$RemindersTableFilterComposer,
    $$RemindersTableOrderingComposer,
    $$RemindersTableAnnotationComposer,
    $$RemindersTableCreateCompanionBuilder,
    $$RemindersTableUpdateCompanionBuilder,
    (
      LocalReminder,
      BaseReferences<_$AppDatabase, $RemindersTable, LocalReminder>
    ),
    LocalReminder,
    PrefetchHooks Function()> {
  $$RemindersTableTableManager(_$AppDatabase db, $RemindersTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RemindersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RemindersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RemindersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<DateTime> remindAt = const Value.absent(),
            Value<String> leadTimesJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> snoozedUntil = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RemindersCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            remindAt: remindAt,
            leadTimesJson: leadTimesJson,
            status: status,
            snoozedUntil: snoozedUntil,
            source: source,
            createdAt: createdAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required DateTime updatedAt,
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            required String title,
            required DateTime remindAt,
            Value<String> leadTimesJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> snoozedUntil = const Value.absent(),
            Value<String> source = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              RemindersCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            remindAt: remindAt,
            leadTimesJson: leadTimesJson,
            status: status,
            snoozedUntil: snoozedUntil,
            source: source,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$RemindersTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $RemindersTable,
    LocalReminder,
    $$RemindersTableFilterComposer,
    $$RemindersTableOrderingComposer,
    $$RemindersTableAnnotationComposer,
    $$RemindersTableCreateCompanionBuilder,
    $$RemindersTableUpdateCompanionBuilder,
    (
      LocalReminder,
      BaseReferences<_$AppDatabase, $RemindersTable, LocalReminder>
    ),
    LocalReminder,
    PrefetchHooks Function()>;
typedef $$AlertsLocalTableCreateCompanionBuilder = AlertsLocalCompanion
    Function({
  required String id,
  required String sourceKind,
  required String sourceId,
  Value<DateTime?> occurrenceAt,
  required String label,
  required DateTime notifyAt,
  required String title,
  Value<String> body,
  Value<String> deepLink,
  required DateTime fetchedAt,
  Value<int> rowid,
});
typedef $$AlertsLocalTableUpdateCompanionBuilder = AlertsLocalCompanion
    Function({
  Value<String> id,
  Value<String> sourceKind,
  Value<String> sourceId,
  Value<DateTime?> occurrenceAt,
  Value<String> label,
  Value<DateTime> notifyAt,
  Value<String> title,
  Value<String> body,
  Value<String> deepLink,
  Value<DateTime> fetchedAt,
  Value<int> rowid,
});

class $$AlertsLocalTableFilterComposer
    extends Composer<_$AppDatabase, $AlertsLocalTable> {
  $$AlertsLocalTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sourceKind => $composableBuilder(
      column: $table.sourceKind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sourceId => $composableBuilder(
      column: $table.sourceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get occurrenceAt => $composableBuilder(
      column: $table.occurrenceAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get label => $composableBuilder(
      column: $table.label, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get notifyAt => $composableBuilder(
      column: $table.notifyAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get body => $composableBuilder(
      column: $table.body, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get deepLink => $composableBuilder(
      column: $table.deepLink, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnFilters(column));
}

class $$AlertsLocalTableOrderingComposer
    extends Composer<_$AppDatabase, $AlertsLocalTable> {
  $$AlertsLocalTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sourceKind => $composableBuilder(
      column: $table.sourceKind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sourceId => $composableBuilder(
      column: $table.sourceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get occurrenceAt => $composableBuilder(
      column: $table.occurrenceAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get label => $composableBuilder(
      column: $table.label, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get notifyAt => $composableBuilder(
      column: $table.notifyAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get body => $composableBuilder(
      column: $table.body, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get deepLink => $composableBuilder(
      column: $table.deepLink, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnOrderings(column));
}

class $$AlertsLocalTableAnnotationComposer
    extends Composer<_$AppDatabase, $AlertsLocalTable> {
  $$AlertsLocalTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get sourceKind => $composableBuilder(
      column: $table.sourceKind, builder: (column) => column);

  GeneratedColumn<String> get sourceId =>
      $composableBuilder(column: $table.sourceId, builder: (column) => column);

  GeneratedColumn<DateTime> get occurrenceAt => $composableBuilder(
      column: $table.occurrenceAt, builder: (column) => column);

  GeneratedColumn<String> get label =>
      $composableBuilder(column: $table.label, builder: (column) => column);

  GeneratedColumn<DateTime> get notifyAt =>
      $composableBuilder(column: $table.notifyAt, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get body =>
      $composableBuilder(column: $table.body, builder: (column) => column);

  GeneratedColumn<String> get deepLink =>
      $composableBuilder(column: $table.deepLink, builder: (column) => column);

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$AlertsLocalTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AlertsLocalTable,
    LocalAlert,
    $$AlertsLocalTableFilterComposer,
    $$AlertsLocalTableOrderingComposer,
    $$AlertsLocalTableAnnotationComposer,
    $$AlertsLocalTableCreateCompanionBuilder,
    $$AlertsLocalTableUpdateCompanionBuilder,
    (LocalAlert, BaseReferences<_$AppDatabase, $AlertsLocalTable, LocalAlert>),
    LocalAlert,
    PrefetchHooks Function()> {
  $$AlertsLocalTableTableManager(_$AppDatabase db, $AlertsLocalTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AlertsLocalTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AlertsLocalTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AlertsLocalTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> sourceKind = const Value.absent(),
            Value<String> sourceId = const Value.absent(),
            Value<DateTime?> occurrenceAt = const Value.absent(),
            Value<String> label = const Value.absent(),
            Value<DateTime> notifyAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String> body = const Value.absent(),
            Value<String> deepLink = const Value.absent(),
            Value<DateTime> fetchedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AlertsLocalCompanion(
            id: id,
            sourceKind: sourceKind,
            sourceId: sourceId,
            occurrenceAt: occurrenceAt,
            label: label,
            notifyAt: notifyAt,
            title: title,
            body: body,
            deepLink: deepLink,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required String sourceKind,
            required String sourceId,
            Value<DateTime?> occurrenceAt = const Value.absent(),
            required String label,
            required DateTime notifyAt,
            required String title,
            Value<String> body = const Value.absent(),
            Value<String> deepLink = const Value.absent(),
            required DateTime fetchedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              AlertsLocalCompanion.insert(
            id: id,
            sourceKind: sourceKind,
            sourceId: sourceId,
            occurrenceAt: occurrenceAt,
            label: label,
            notifyAt: notifyAt,
            title: title,
            body: body,
            deepLink: deepLink,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$AlertsLocalTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $AlertsLocalTable,
    LocalAlert,
    $$AlertsLocalTableFilterComposer,
    $$AlertsLocalTableOrderingComposer,
    $$AlertsLocalTableAnnotationComposer,
    $$AlertsLocalTableCreateCompanionBuilder,
    $$AlertsLocalTableUpdateCompanionBuilder,
    (LocalAlert, BaseReferences<_$AppDatabase, $AlertsLocalTable, LocalAlert>),
    LocalAlert,
    PrefetchHooks Function()>;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$KeyValuesTableTableManager get keyValues =>
      $$KeyValuesTableTableManager(_db, _db.keyValues);
  $$ProfilesTableTableManager get profiles =>
      $$ProfilesTableTableManager(_db, _db.profiles);
  $$UserPreferencesTableTableManager get userPreferences =>
      $$UserPreferencesTableTableManager(_db, _db.userPreferences);
  $$LabelsTableTableManager get labels =>
      $$LabelsTableTableManager(_db, _db.labels);
  $$TasksTableTableManager get tasks =>
      $$TasksTableTableManager(_db, _db.tasks);
  $$RemindersTableTableManager get reminders =>
      $$RemindersTableTableManager(_db, _db.reminders);
  $$AlertsLocalTableTableManager get alertsLocal =>
      $$AlertsLocalTableTableManager(_db, _db.alertsLocal);
}
