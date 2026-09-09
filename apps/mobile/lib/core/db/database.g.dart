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

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $KeyValuesTable keyValues = $KeyValuesTable(this);
  late final $ProfilesTable profiles = $ProfilesTable(this);
  late final $UserPreferencesTable userPreferences =
      $UserPreferencesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities =>
      [keyValues, profiles, userPreferences];
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
              .map((e) => (
                    e.readTable<$KeyValuesTable, KeyValue>(table),
                    BaseReferences<_$AppDatabase, $KeyValuesTable, KeyValue>(
                        db, table, e)
                  ))
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
              .map((e) => (
                    e.readTable<$ProfilesTable, Profile>(table),
                    BaseReferences<_$AppDatabase, $ProfilesTable, Profile>(
                        db, table, e)
                  ))
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
              .map((e) => (
                    e.readTable<$UserPreferencesTable, UserPreference>(table),
                    BaseReferences<_$AppDatabase, $UserPreferencesTable,
                        UserPreference>(db, table, e)
                  ))
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

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$KeyValuesTableTableManager get keyValues =>
      $$KeyValuesTableTableManager(_db, _db.keyValues);
  $$ProfilesTableTableManager get profiles =>
      $$ProfilesTableTableManager(_db, _db.profiles);
  $$UserPreferencesTableTableManager get userPreferences =>
      $$UserPreferencesTableTableManager(_db, _db.userPreferences);
}
