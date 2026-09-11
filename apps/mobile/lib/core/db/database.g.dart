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

class $DailyPlansTable extends DailyPlans
    with TableInfo<$DailyPlansTable, LocalDailyPlan> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $DailyPlansTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<String> date = GeneratedColumn<String>(
      'date', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('draft'));
  static const VerificationMeta _autoConfirmedMeta =
      const VerificationMeta('autoConfirmed');
  @override
  late final GeneratedColumn<bool> autoConfirmed = GeneratedColumn<bool>(
      'auto_confirmed', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("auto_confirmed" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _tasksJsonMeta =
      const VerificationMeta('tasksJson');
  @override
  late final GeneratedColumn<String> tasksJson = GeneratedColumn<String>(
      'tasks_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _trainingJsonMeta =
      const VerificationMeta('trainingJson');
  @override
  late final GeneratedColumn<String> trainingJson = GeneratedColumn<String>(
      'training_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _workoutLineMeta =
      const VerificationMeta('workoutLine');
  @override
  late final GeneratedColumn<String> workoutLine = GeneratedColumn<String>(
      'workout_line', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _mealLineMeta =
      const VerificationMeta('mealLine');
  @override
  late final GeneratedColumn<String> mealLine = GeneratedColumn<String>(
      'meal_line', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _promptedAtMeta =
      const VerificationMeta('promptedAt');
  @override
  late final GeneratedColumn<DateTime> promptedAt = GeneratedColumn<DateTime>(
      'prompted_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _confirmedAtMeta =
      const VerificationMeta('confirmedAt');
  @override
  late final GeneratedColumn<DateTime> confirmedAt = GeneratedColumn<DateTime>(
      'confirmed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _summarisedAtMeta =
      const VerificationMeta('summarisedAt');
  @override
  late final GeneratedColumn<DateTime> summarisedAt = GeneratedColumn<DateTime>(
      'summarised_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _briefedAtMeta =
      const VerificationMeta('briefedAt');
  @override
  late final GeneratedColumn<DateTime> briefedAt = GeneratedColumn<DateTime>(
      'briefed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        date,
        status,
        autoConfirmed,
        tasksJson,
        trainingJson,
        workoutLine,
        mealLine,
        promptedAt,
        confirmedAt,
        summarisedAt,
        briefedAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'daily_plans';
  @override
  VerificationContext validateIntegrity(Insertable<LocalDailyPlan> instance,
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
    if (data.containsKey('date')) {
      context.handle(
          _dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));
    } else if (isInserting) {
      context.missing(_dateMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('auto_confirmed')) {
      context.handle(
          _autoConfirmedMeta,
          autoConfirmed.isAcceptableOrUnknown(
              data['auto_confirmed']!, _autoConfirmedMeta));
    }
    if (data.containsKey('tasks_json')) {
      context.handle(_tasksJsonMeta,
          tasksJson.isAcceptableOrUnknown(data['tasks_json']!, _tasksJsonMeta));
    }
    if (data.containsKey('training_json')) {
      context.handle(
          _trainingJsonMeta,
          trainingJson.isAcceptableOrUnknown(
              data['training_json']!, _trainingJsonMeta));
    }
    if (data.containsKey('workout_line')) {
      context.handle(
          _workoutLineMeta,
          workoutLine.isAcceptableOrUnknown(
              data['workout_line']!, _workoutLineMeta));
    }
    if (data.containsKey('meal_line')) {
      context.handle(_mealLineMeta,
          mealLine.isAcceptableOrUnknown(data['meal_line']!, _mealLineMeta));
    }
    if (data.containsKey('prompted_at')) {
      context.handle(
          _promptedAtMeta,
          promptedAt.isAcceptableOrUnknown(
              data['prompted_at']!, _promptedAtMeta));
    }
    if (data.containsKey('confirmed_at')) {
      context.handle(
          _confirmedAtMeta,
          confirmedAt.isAcceptableOrUnknown(
              data['confirmed_at']!, _confirmedAtMeta));
    }
    if (data.containsKey('summarised_at')) {
      context.handle(
          _summarisedAtMeta,
          summarisedAt.isAcceptableOrUnknown(
              data['summarised_at']!, _summarisedAtMeta));
    }
    if (data.containsKey('briefed_at')) {
      context.handle(_briefedAtMeta,
          briefedAt.isAcceptableOrUnknown(data['briefed_at']!, _briefedAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalDailyPlan map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalDailyPlan(
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
      date: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}date'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      autoConfirmed: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}auto_confirmed'])!,
      tasksJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tasks_json'])!,
      trainingJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}training_json']),
      workoutLine: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}workout_line']),
      mealLine: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}meal_line']),
      promptedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}prompted_at']),
      confirmedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}confirmed_at']),
      summarisedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}summarised_at']),
      briefedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}briefed_at']),
    );
  }

  @override
  $DailyPlansTable createAlias(String alias) {
    return $DailyPlansTable(attachedDatabase, alias);
  }
}

class LocalDailyPlan extends DataClass implements Insertable<LocalDailyPlan> {
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

  /// `YYYY-MM-DD` in the **member's** zone, as the server resolved it. A text
  /// column and not a `DateTimeColumn`: a local date is a date, and storing it
  /// as an instant would make it a moment in some zone — which is exactly the
  /// three-hour shift principle XI exists to stop.
  final String date;

  /// `draft` | `confirmed` | `skipped`.
  final String status;

  /// True when the end-of-day touch set the plan because the member never
  /// answered. Kept apart from [status] because "confirmed by me" and
  /// "confirmed for me at 22:00" are the same status and different sentences,
  /// and the summary has to say which.
  final bool autoConfirmed;
  final String tasksJson;

  /// `{sessionId,title,sport,startAt}`, or null when there is no training —
  /// which is also what a member who answered "no training tomorrow" leaves
  /// behind, and what every plan looks like until P6 lands the Training
  /// context. The card reads correctly without it (spec Assumptions).
  final String? trainingJson;
  final String? workoutLine;

  /// Absent until P8's nutrition feature, and absent again whenever the model
  /// could not draft it — FR-012: a missing meal line never stops the plan
  /// being sent, so it must never stop the card drawing either.
  final String? mealLine;
  final DateTime? promptedAt;
  final DateTime? confirmedAt;
  final DateTime? summarisedAt;
  final DateTime? briefedAt;
  const LocalDailyPlan(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.date,
      required this.status,
      required this.autoConfirmed,
      required this.tasksJson,
      this.trainingJson,
      this.workoutLine,
      this.mealLine,
      this.promptedAt,
      this.confirmedAt,
      this.summarisedAt,
      this.briefedAt});
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
    map['date'] = Variable<String>(date);
    map['status'] = Variable<String>(status);
    map['auto_confirmed'] = Variable<bool>(autoConfirmed);
    map['tasks_json'] = Variable<String>(tasksJson);
    if (!nullToAbsent || trainingJson != null) {
      map['training_json'] = Variable<String>(trainingJson);
    }
    if (!nullToAbsent || workoutLine != null) {
      map['workout_line'] = Variable<String>(workoutLine);
    }
    if (!nullToAbsent || mealLine != null) {
      map['meal_line'] = Variable<String>(mealLine);
    }
    if (!nullToAbsent || promptedAt != null) {
      map['prompted_at'] = Variable<DateTime>(promptedAt);
    }
    if (!nullToAbsent || confirmedAt != null) {
      map['confirmed_at'] = Variable<DateTime>(confirmedAt);
    }
    if (!nullToAbsent || summarisedAt != null) {
      map['summarised_at'] = Variable<DateTime>(summarisedAt);
    }
    if (!nullToAbsent || briefedAt != null) {
      map['briefed_at'] = Variable<DateTime>(briefedAt);
    }
    return map;
  }

  DailyPlansCompanion toCompanion(bool nullToAbsent) {
    return DailyPlansCompanion(
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
      date: Value(date),
      status: Value(status),
      autoConfirmed: Value(autoConfirmed),
      tasksJson: Value(tasksJson),
      trainingJson: trainingJson == null && nullToAbsent
          ? const Value.absent()
          : Value(trainingJson),
      workoutLine: workoutLine == null && nullToAbsent
          ? const Value.absent()
          : Value(workoutLine),
      mealLine: mealLine == null && nullToAbsent
          ? const Value.absent()
          : Value(mealLine),
      promptedAt: promptedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(promptedAt),
      confirmedAt: confirmedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(confirmedAt),
      summarisedAt: summarisedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(summarisedAt),
      briefedAt: briefedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(briefedAt),
    );
  }

  factory LocalDailyPlan.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalDailyPlan(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      date: serializer.fromJson<String>(json['date']),
      status: serializer.fromJson<String>(json['status']),
      autoConfirmed: serializer.fromJson<bool>(json['autoConfirmed']),
      tasksJson: serializer.fromJson<String>(json['tasksJson']),
      trainingJson: serializer.fromJson<String?>(json['trainingJson']),
      workoutLine: serializer.fromJson<String?>(json['workoutLine']),
      mealLine: serializer.fromJson<String?>(json['mealLine']),
      promptedAt: serializer.fromJson<DateTime?>(json['promptedAt']),
      confirmedAt: serializer.fromJson<DateTime?>(json['confirmedAt']),
      summarisedAt: serializer.fromJson<DateTime?>(json['summarisedAt']),
      briefedAt: serializer.fromJson<DateTime?>(json['briefedAt']),
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
      'date': serializer.toJson<String>(date),
      'status': serializer.toJson<String>(status),
      'autoConfirmed': serializer.toJson<bool>(autoConfirmed),
      'tasksJson': serializer.toJson<String>(tasksJson),
      'trainingJson': serializer.toJson<String?>(trainingJson),
      'workoutLine': serializer.toJson<String?>(workoutLine),
      'mealLine': serializer.toJson<String?>(mealLine),
      'promptedAt': serializer.toJson<DateTime?>(promptedAt),
      'confirmedAt': serializer.toJson<DateTime?>(confirmedAt),
      'summarisedAt': serializer.toJson<DateTime?>(summarisedAt),
      'briefedAt': serializer.toJson<DateTime?>(briefedAt),
    };
  }

  LocalDailyPlan copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? date,
          String? status,
          bool? autoConfirmed,
          String? tasksJson,
          Value<String?> trainingJson = const Value.absent(),
          Value<String?> workoutLine = const Value.absent(),
          Value<String?> mealLine = const Value.absent(),
          Value<DateTime?> promptedAt = const Value.absent(),
          Value<DateTime?> confirmedAt = const Value.absent(),
          Value<DateTime?> summarisedAt = const Value.absent(),
          Value<DateTime?> briefedAt = const Value.absent()}) =>
      LocalDailyPlan(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        date: date ?? this.date,
        status: status ?? this.status,
        autoConfirmed: autoConfirmed ?? this.autoConfirmed,
        tasksJson: tasksJson ?? this.tasksJson,
        trainingJson:
            trainingJson.present ? trainingJson.value : this.trainingJson,
        workoutLine: workoutLine.present ? workoutLine.value : this.workoutLine,
        mealLine: mealLine.present ? mealLine.value : this.mealLine,
        promptedAt: promptedAt.present ? promptedAt.value : this.promptedAt,
        confirmedAt: confirmedAt.present ? confirmedAt.value : this.confirmedAt,
        summarisedAt:
            summarisedAt.present ? summarisedAt.value : this.summarisedAt,
        briefedAt: briefedAt.present ? briefedAt.value : this.briefedAt,
      );
  LocalDailyPlan copyWithCompanion(DailyPlansCompanion data) {
    return LocalDailyPlan(
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
      date: data.date.present ? data.date.value : this.date,
      status: data.status.present ? data.status.value : this.status,
      autoConfirmed: data.autoConfirmed.present
          ? data.autoConfirmed.value
          : this.autoConfirmed,
      tasksJson: data.tasksJson.present ? data.tasksJson.value : this.tasksJson,
      trainingJson: data.trainingJson.present
          ? data.trainingJson.value
          : this.trainingJson,
      workoutLine:
          data.workoutLine.present ? data.workoutLine.value : this.workoutLine,
      mealLine: data.mealLine.present ? data.mealLine.value : this.mealLine,
      promptedAt:
          data.promptedAt.present ? data.promptedAt.value : this.promptedAt,
      confirmedAt:
          data.confirmedAt.present ? data.confirmedAt.value : this.confirmedAt,
      summarisedAt: data.summarisedAt.present
          ? data.summarisedAt.value
          : this.summarisedAt,
      briefedAt: data.briefedAt.present ? data.briefedAt.value : this.briefedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalDailyPlan(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('date: $date, ')
          ..write('status: $status, ')
          ..write('autoConfirmed: $autoConfirmed, ')
          ..write('tasksJson: $tasksJson, ')
          ..write('trainingJson: $trainingJson, ')
          ..write('workoutLine: $workoutLine, ')
          ..write('mealLine: $mealLine, ')
          ..write('promptedAt: $promptedAt, ')
          ..write('confirmedAt: $confirmedAt, ')
          ..write('summarisedAt: $summarisedAt, ')
          ..write('briefedAt: $briefedAt')
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
      date,
      status,
      autoConfirmed,
      tasksJson,
      trainingJson,
      workoutLine,
      mealLine,
      promptedAt,
      confirmedAt,
      summarisedAt,
      briefedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalDailyPlan &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.date == this.date &&
          other.status == this.status &&
          other.autoConfirmed == this.autoConfirmed &&
          other.tasksJson == this.tasksJson &&
          other.trainingJson == this.trainingJson &&
          other.workoutLine == this.workoutLine &&
          other.mealLine == this.mealLine &&
          other.promptedAt == this.promptedAt &&
          other.confirmedAt == this.confirmedAt &&
          other.summarisedAt == this.summarisedAt &&
          other.briefedAt == this.briefedAt);
}

class DailyPlansCompanion extends UpdateCompanion<LocalDailyPlan> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> date;
  final Value<String> status;
  final Value<bool> autoConfirmed;
  final Value<String> tasksJson;
  final Value<String?> trainingJson;
  final Value<String?> workoutLine;
  final Value<String?> mealLine;
  final Value<DateTime?> promptedAt;
  final Value<DateTime?> confirmedAt;
  final Value<DateTime?> summarisedAt;
  final Value<DateTime?> briefedAt;
  final Value<int> rowid;
  const DailyPlansCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.date = const Value.absent(),
    this.status = const Value.absent(),
    this.autoConfirmed = const Value.absent(),
    this.tasksJson = const Value.absent(),
    this.trainingJson = const Value.absent(),
    this.workoutLine = const Value.absent(),
    this.mealLine = const Value.absent(),
    this.promptedAt = const Value.absent(),
    this.confirmedAt = const Value.absent(),
    this.summarisedAt = const Value.absent(),
    this.briefedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  DailyPlansCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String date,
    this.status = const Value.absent(),
    this.autoConfirmed = const Value.absent(),
    this.tasksJson = const Value.absent(),
    this.trainingJson = const Value.absent(),
    this.workoutLine = const Value.absent(),
    this.mealLine = const Value.absent(),
    this.promptedAt = const Value.absent(),
    this.confirmedAt = const Value.absent(),
    this.summarisedAt = const Value.absent(),
    this.briefedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        date = Value(date);
  static Insertable<LocalDailyPlan> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? date,
    Expression<String>? status,
    Expression<bool>? autoConfirmed,
    Expression<String>? tasksJson,
    Expression<String>? trainingJson,
    Expression<String>? workoutLine,
    Expression<String>? mealLine,
    Expression<DateTime>? promptedAt,
    Expression<DateTime>? confirmedAt,
    Expression<DateTime>? summarisedAt,
    Expression<DateTime>? briefedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (date != null) 'date': date,
      if (status != null) 'status': status,
      if (autoConfirmed != null) 'auto_confirmed': autoConfirmed,
      if (tasksJson != null) 'tasks_json': tasksJson,
      if (trainingJson != null) 'training_json': trainingJson,
      if (workoutLine != null) 'workout_line': workoutLine,
      if (mealLine != null) 'meal_line': mealLine,
      if (promptedAt != null) 'prompted_at': promptedAt,
      if (confirmedAt != null) 'confirmed_at': confirmedAt,
      if (summarisedAt != null) 'summarised_at': summarisedAt,
      if (briefedAt != null) 'briefed_at': briefedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  DailyPlansCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? date,
      Value<String>? status,
      Value<bool>? autoConfirmed,
      Value<String>? tasksJson,
      Value<String?>? trainingJson,
      Value<String?>? workoutLine,
      Value<String?>? mealLine,
      Value<DateTime?>? promptedAt,
      Value<DateTime?>? confirmedAt,
      Value<DateTime?>? summarisedAt,
      Value<DateTime?>? briefedAt,
      Value<int>? rowid}) {
    return DailyPlansCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      date: date ?? this.date,
      status: status ?? this.status,
      autoConfirmed: autoConfirmed ?? this.autoConfirmed,
      tasksJson: tasksJson ?? this.tasksJson,
      trainingJson: trainingJson ?? this.trainingJson,
      workoutLine: workoutLine ?? this.workoutLine,
      mealLine: mealLine ?? this.mealLine,
      promptedAt: promptedAt ?? this.promptedAt,
      confirmedAt: confirmedAt ?? this.confirmedAt,
      summarisedAt: summarisedAt ?? this.summarisedAt,
      briefedAt: briefedAt ?? this.briefedAt,
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
    if (date.present) {
      map['date'] = Variable<String>(date.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (autoConfirmed.present) {
      map['auto_confirmed'] = Variable<bool>(autoConfirmed.value);
    }
    if (tasksJson.present) {
      map['tasks_json'] = Variable<String>(tasksJson.value);
    }
    if (trainingJson.present) {
      map['training_json'] = Variable<String>(trainingJson.value);
    }
    if (workoutLine.present) {
      map['workout_line'] = Variable<String>(workoutLine.value);
    }
    if (mealLine.present) {
      map['meal_line'] = Variable<String>(mealLine.value);
    }
    if (promptedAt.present) {
      map['prompted_at'] = Variable<DateTime>(promptedAt.value);
    }
    if (confirmedAt.present) {
      map['confirmed_at'] = Variable<DateTime>(confirmedAt.value);
    }
    if (summarisedAt.present) {
      map['summarised_at'] = Variable<DateTime>(summarisedAt.value);
    }
    if (briefedAt.present) {
      map['briefed_at'] = Variable<DateTime>(briefedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('DailyPlansCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('date: $date, ')
          ..write('status: $status, ')
          ..write('autoConfirmed: $autoConfirmed, ')
          ..write('tasksJson: $tasksJson, ')
          ..write('trainingJson: $trainingJson, ')
          ..write('workoutLine: $workoutLine, ')
          ..write('mealLine: $mealLine, ')
          ..write('promptedAt: $promptedAt, ')
          ..write('confirmedAt: $confirmedAt, ')
          ..write('summarisedAt: $summarisedAt, ')
          ..write('briefedAt: $briefedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CheckinsTable extends Checkins
    with TableInfo<$CheckinsTable, LocalCheckin> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CheckinsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _dateMeta = const VerificationMeta('date');
  @override
  late final GeneratedColumn<String> date = GeneratedColumn<String>(
      'date', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _moodMeta = const VerificationMeta('mood');
  @override
  late final GeneratedColumn<int> mood = GeneratedColumn<int>(
      'mood', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _adheredMeta =
      const VerificationMeta('adhered');
  @override
  late final GeneratedColumn<bool> adhered = GeneratedColumn<bool>(
      'adhered', aliasedName, true,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("adhered" IN (0, 1))'));
  static const VerificationMeta _noteMeta = const VerificationMeta('note');
  @override
  late final GeneratedColumn<String> note = GeneratedColumn<String>(
      'note', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('app'));
  @override
  List<GeneratedColumn> get $columns => [
        id,
        updatedAt,
        baseUpdatedAt,
        pendingOp,
        pushAttempts,
        deletedAt,
        date,
        mood,
        adhered,
        note,
        source
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'checkins';
  @override
  VerificationContext validateIntegrity(Insertable<LocalCheckin> instance,
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
    if (data.containsKey('date')) {
      context.handle(
          _dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));
    } else if (isInserting) {
      context.missing(_dateMeta);
    }
    if (data.containsKey('mood')) {
      context.handle(
          _moodMeta, mood.isAcceptableOrUnknown(data['mood']!, _moodMeta));
    }
    if (data.containsKey('adhered')) {
      context.handle(_adheredMeta,
          adhered.isAcceptableOrUnknown(data['adhered']!, _adheredMeta));
    }
    if (data.containsKey('note')) {
      context.handle(
          _noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalCheckin map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalCheckin(
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
      date: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}date'])!,
      mood: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}mood']),
      adhered: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}adhered']),
      note: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}note']),
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
    );
  }

  @override
  $CheckinsTable createAlias(String alias) {
    return $CheckinsTable(attachedDatabase, alias);
  }
}

class LocalCheckin extends DataClass implements Insertable<LocalCheckin> {
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
  final String date;

  /// 0..100, and **nullable on purpose**. Nought is a real answer — the worst
  /// day the scale can describe — so "no mood recorded" cannot be represented
  /// by a zero, and a non-nullable column with a default of 0 would turn every
  /// unanswered day into the member's worst. The week strip on Home reads the
  /// same distinction: see [adhered].
  final int? mood;

  /// Whether the plan was followed, or null for a day that was never answered.
  ///
  /// Three states, not two, and the third one is the one that gets lost: a day
  /// the member did not answer is **not** a missed day. Rendering it as a miss
  /// tells somebody who was travelling that they broke a streak they never
  /// broke, which is why nothing on the phone stores this week as a
  /// `List<bool>`.
  final bool? adhered;
  final String? note;

  /// `chat` | `notification` | `app` — where the answer came from.
  final String source;
  const LocalCheckin(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.date,
      this.mood,
      this.adhered,
      this.note,
      required this.source});
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
    map['date'] = Variable<String>(date);
    if (!nullToAbsent || mood != null) {
      map['mood'] = Variable<int>(mood);
    }
    if (!nullToAbsent || adhered != null) {
      map['adhered'] = Variable<bool>(adhered);
    }
    if (!nullToAbsent || note != null) {
      map['note'] = Variable<String>(note);
    }
    map['source'] = Variable<String>(source);
    return map;
  }

  CheckinsCompanion toCompanion(bool nullToAbsent) {
    return CheckinsCompanion(
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
      date: Value(date),
      mood: mood == null && nullToAbsent ? const Value.absent() : Value(mood),
      adhered: adhered == null && nullToAbsent
          ? const Value.absent()
          : Value(adhered),
      note: note == null && nullToAbsent ? const Value.absent() : Value(note),
      source: Value(source),
    );
  }

  factory LocalCheckin.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalCheckin(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      date: serializer.fromJson<String>(json['date']),
      mood: serializer.fromJson<int?>(json['mood']),
      adhered: serializer.fromJson<bool?>(json['adhered']),
      note: serializer.fromJson<String?>(json['note']),
      source: serializer.fromJson<String>(json['source']),
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
      'date': serializer.toJson<String>(date),
      'mood': serializer.toJson<int?>(mood),
      'adhered': serializer.toJson<bool?>(adhered),
      'note': serializer.toJson<String?>(note),
      'source': serializer.toJson<String>(source),
    };
  }

  LocalCheckin copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? date,
          Value<int?> mood = const Value.absent(),
          Value<bool?> adhered = const Value.absent(),
          Value<String?> note = const Value.absent(),
          String? source}) =>
      LocalCheckin(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        date: date ?? this.date,
        mood: mood.present ? mood.value : this.mood,
        adhered: adhered.present ? adhered.value : this.adhered,
        note: note.present ? note.value : this.note,
        source: source ?? this.source,
      );
  LocalCheckin copyWithCompanion(CheckinsCompanion data) {
    return LocalCheckin(
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
      date: data.date.present ? data.date.value : this.date,
      mood: data.mood.present ? data.mood.value : this.mood,
      adhered: data.adhered.present ? data.adhered.value : this.adhered,
      note: data.note.present ? data.note.value : this.note,
      source: data.source.present ? data.source.value : this.source,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalCheckin(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('date: $date, ')
          ..write('mood: $mood, ')
          ..write('adhered: $adhered, ')
          ..write('note: $note, ')
          ..write('source: $source')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, updatedAt, baseUpdatedAt, pendingOp,
      pushAttempts, deletedAt, date, mood, adhered, note, source);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalCheckin &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.date == this.date &&
          other.mood == this.mood &&
          other.adhered == this.adhered &&
          other.note == this.note &&
          other.source == this.source);
}

class CheckinsCompanion extends UpdateCompanion<LocalCheckin> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> date;
  final Value<int?> mood;
  final Value<bool?> adhered;
  final Value<String?> note;
  final Value<String> source;
  final Value<int> rowid;
  const CheckinsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.date = const Value.absent(),
    this.mood = const Value.absent(),
    this.adhered = const Value.absent(),
    this.note = const Value.absent(),
    this.source = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CheckinsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String date,
    this.mood = const Value.absent(),
    this.adhered = const Value.absent(),
    this.note = const Value.absent(),
    this.source = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        date = Value(date);
  static Insertable<LocalCheckin> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? date,
    Expression<int>? mood,
    Expression<bool>? adhered,
    Expression<String>? note,
    Expression<String>? source,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (baseUpdatedAt != null) 'base_updated_at': baseUpdatedAt,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (date != null) 'date': date,
      if (mood != null) 'mood': mood,
      if (adhered != null) 'adhered': adhered,
      if (note != null) 'note': note,
      if (source != null) 'source': source,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CheckinsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? date,
      Value<int?>? mood,
      Value<bool?>? adhered,
      Value<String?>? note,
      Value<String>? source,
      Value<int>? rowid}) {
    return CheckinsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      date: date ?? this.date,
      mood: mood ?? this.mood,
      adhered: adhered ?? this.adhered,
      note: note ?? this.note,
      source: source ?? this.source,
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
    if (date.present) {
      map['date'] = Variable<String>(date.value);
    }
    if (mood.present) {
      map['mood'] = Variable<int>(mood.value);
    }
    if (adhered.present) {
      map['adhered'] = Variable<bool>(adhered.value);
    }
    if (note.present) {
      map['note'] = Variable<String>(note.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CheckinsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('date: $date, ')
          ..write('mood: $mood, ')
          ..write('adhered: $adhered, ')
          ..write('note: $note, ')
          ..write('source: $source, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RhythmStateTable extends RhythmState
    with TableInfo<$RhythmStateTable, LocalRhythmState> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RhythmStateTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _lastPlanPromptDateMeta =
      const VerificationMeta('lastPlanPromptDate');
  @override
  late final GeneratedColumn<String> lastPlanPromptDate =
      GeneratedColumn<String>('last_plan_prompt_date', aliasedName, true,
          type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _lastEndOfDayDateMeta =
      const VerificationMeta('lastEndOfDayDate');
  @override
  late final GeneratedColumn<String> lastEndOfDayDate = GeneratedColumn<String>(
      'last_end_of_day_date', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _lastMorningBriefingDateMeta =
      const VerificationMeta('lastMorningBriefingDate');
  @override
  late final GeneratedColumn<String> lastMorningBriefingDate =
      GeneratedColumn<String>('last_morning_briefing_date', aliasedName, true,
          type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _awaitingCheckinMeta =
      const VerificationMeta('awaitingCheckin');
  @override
  late final GeneratedColumn<bool> awaitingCheckin = GeneratedColumn<bool>(
      'awaiting_checkin', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("awaiting_checkin" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _awaitingSinceMeta =
      const VerificationMeta('awaitingSince');
  @override
  late final GeneratedColumn<DateTime> awaitingSince =
      GeneratedColumn<DateTime>('awaiting_since', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _streakCurrentMeta =
      const VerificationMeta('streakCurrent');
  @override
  late final GeneratedColumn<int> streakCurrent = GeneratedColumn<int>(
      'streak_current', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _streakBestMeta =
      const VerificationMeta('streakBest');
  @override
  late final GeneratedColumn<int> streakBest = GeneratedColumn<int>(
      'streak_best', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _lastAdheredDateMeta =
      const VerificationMeta('lastAdheredDate');
  @override
  late final GeneratedColumn<String> lastAdheredDate = GeneratedColumn<String>(
      'last_adhered_date', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  @override
  List<GeneratedColumn> get $columns => [
        userId,
        lastPlanPromptDate,
        lastEndOfDayDate,
        lastMorningBriefingDate,
        awaitingCheckin,
        awaitingSince,
        streakCurrent,
        streakBest,
        lastAdheredDate
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'rhythm_state';
  @override
  VerificationContext validateIntegrity(Insertable<LocalRhythmState> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(_userIdMeta,
          userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('last_plan_prompt_date')) {
      context.handle(
          _lastPlanPromptDateMeta,
          lastPlanPromptDate.isAcceptableOrUnknown(
              data['last_plan_prompt_date']!, _lastPlanPromptDateMeta));
    }
    if (data.containsKey('last_end_of_day_date')) {
      context.handle(
          _lastEndOfDayDateMeta,
          lastEndOfDayDate.isAcceptableOrUnknown(
              data['last_end_of_day_date']!, _lastEndOfDayDateMeta));
    }
    if (data.containsKey('last_morning_briefing_date')) {
      context.handle(
          _lastMorningBriefingDateMeta,
          lastMorningBriefingDate.isAcceptableOrUnknown(
              data['last_morning_briefing_date']!,
              _lastMorningBriefingDateMeta));
    }
    if (data.containsKey('awaiting_checkin')) {
      context.handle(
          _awaitingCheckinMeta,
          awaitingCheckin.isAcceptableOrUnknown(
              data['awaiting_checkin']!, _awaitingCheckinMeta));
    }
    if (data.containsKey('awaiting_since')) {
      context.handle(
          _awaitingSinceMeta,
          awaitingSince.isAcceptableOrUnknown(
              data['awaiting_since']!, _awaitingSinceMeta));
    }
    if (data.containsKey('streak_current')) {
      context.handle(
          _streakCurrentMeta,
          streakCurrent.isAcceptableOrUnknown(
              data['streak_current']!, _streakCurrentMeta));
    }
    if (data.containsKey('streak_best')) {
      context.handle(
          _streakBestMeta,
          streakBest.isAcceptableOrUnknown(
              data['streak_best']!, _streakBestMeta));
    }
    if (data.containsKey('last_adhered_date')) {
      context.handle(
          _lastAdheredDateMeta,
          lastAdheredDate.isAcceptableOrUnknown(
              data['last_adhered_date']!, _lastAdheredDateMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {userId};
  @override
  LocalRhythmState map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalRhythmState(
      userId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}user_id'])!,
      lastPlanPromptDate: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}last_plan_prompt_date']),
      lastEndOfDayDate: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}last_end_of_day_date']),
      lastMorningBriefingDate: attachedDatabase.typeMapping.read(
          DriftSqlType.string,
          data['${effectivePrefix}last_morning_briefing_date']),
      awaitingCheckin: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}awaiting_checkin'])!,
      awaitingSince: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}awaiting_since']),
      streakCurrent: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}streak_current'])!,
      streakBest: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}streak_best'])!,
      lastAdheredDate: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}last_adhered_date']),
    );
  }

  @override
  $RhythmStateTable createAlias(String alias) {
    return $RhythmStateTable(attachedDatabase, alias);
  }
}

class LocalRhythmState extends DataClass
    implements Insertable<LocalRhythmState> {
  final String userId;

  /// The local dates each touch was last claimed for, `YYYY-MM-DD`, null until
  /// the first one fires. Three columns and not one, for the same reason the
  /// server has three claim methods: a gateway that came back between the
  /// 21:00 and 22:00 touches must be able to send the one it missed without
  /// re-sending the one it did not.
  final String? lastPlanPromptDate;
  final String? lastEndOfDayDate;
  final String? lastMorningBriefingDate;

  /// Whether the end-of-day question is still open. One flag per member, which
  /// is why the server only ever interprets a reply inside the coach
  /// conversation — see the check-in note in the root `CLAUDE.md`.
  final bool awaitingCheckin;

  /// When the question was asked. The window that follows is an operator
  /// setting (`settings.rhythm.checkinWindowHours`), so it is not stored here:
  /// a length compiled into the phone would be a hard-coded default, which
  /// constitution XII calls a bug.
  final DateTime? awaitingSince;
  final int streakCurrent;

  /// The best run so far, kept when the current one resets. FR-008: a "no"
  /// restarts the count and must not erase what the member already managed.
  final int streakBest;
  final String? lastAdheredDate;
  const LocalRhythmState(
      {required this.userId,
      this.lastPlanPromptDate,
      this.lastEndOfDayDate,
      this.lastMorningBriefingDate,
      required this.awaitingCheckin,
      this.awaitingSince,
      required this.streakCurrent,
      required this.streakBest,
      this.lastAdheredDate});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    if (!nullToAbsent || lastPlanPromptDate != null) {
      map['last_plan_prompt_date'] = Variable<String>(lastPlanPromptDate);
    }
    if (!nullToAbsent || lastEndOfDayDate != null) {
      map['last_end_of_day_date'] = Variable<String>(lastEndOfDayDate);
    }
    if (!nullToAbsent || lastMorningBriefingDate != null) {
      map['last_morning_briefing_date'] =
          Variable<String>(lastMorningBriefingDate);
    }
    map['awaiting_checkin'] = Variable<bool>(awaitingCheckin);
    if (!nullToAbsent || awaitingSince != null) {
      map['awaiting_since'] = Variable<DateTime>(awaitingSince);
    }
    map['streak_current'] = Variable<int>(streakCurrent);
    map['streak_best'] = Variable<int>(streakBest);
    if (!nullToAbsent || lastAdheredDate != null) {
      map['last_adhered_date'] = Variable<String>(lastAdheredDate);
    }
    return map;
  }

  RhythmStateCompanion toCompanion(bool nullToAbsent) {
    return RhythmStateCompanion(
      userId: Value(userId),
      lastPlanPromptDate: lastPlanPromptDate == null && nullToAbsent
          ? const Value.absent()
          : Value(lastPlanPromptDate),
      lastEndOfDayDate: lastEndOfDayDate == null && nullToAbsent
          ? const Value.absent()
          : Value(lastEndOfDayDate),
      lastMorningBriefingDate: lastMorningBriefingDate == null && nullToAbsent
          ? const Value.absent()
          : Value(lastMorningBriefingDate),
      awaitingCheckin: Value(awaitingCheckin),
      awaitingSince: awaitingSince == null && nullToAbsent
          ? const Value.absent()
          : Value(awaitingSince),
      streakCurrent: Value(streakCurrent),
      streakBest: Value(streakBest),
      lastAdheredDate: lastAdheredDate == null && nullToAbsent
          ? const Value.absent()
          : Value(lastAdheredDate),
    );
  }

  factory LocalRhythmState.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalRhythmState(
      userId: serializer.fromJson<String>(json['userId']),
      lastPlanPromptDate:
          serializer.fromJson<String?>(json['lastPlanPromptDate']),
      lastEndOfDayDate: serializer.fromJson<String?>(json['lastEndOfDayDate']),
      lastMorningBriefingDate:
          serializer.fromJson<String?>(json['lastMorningBriefingDate']),
      awaitingCheckin: serializer.fromJson<bool>(json['awaitingCheckin']),
      awaitingSince: serializer.fromJson<DateTime?>(json['awaitingSince']),
      streakCurrent: serializer.fromJson<int>(json['streakCurrent']),
      streakBest: serializer.fromJson<int>(json['streakBest']),
      lastAdheredDate: serializer.fromJson<String?>(json['lastAdheredDate']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'lastPlanPromptDate': serializer.toJson<String?>(lastPlanPromptDate),
      'lastEndOfDayDate': serializer.toJson<String?>(lastEndOfDayDate),
      'lastMorningBriefingDate':
          serializer.toJson<String?>(lastMorningBriefingDate),
      'awaitingCheckin': serializer.toJson<bool>(awaitingCheckin),
      'awaitingSince': serializer.toJson<DateTime?>(awaitingSince),
      'streakCurrent': serializer.toJson<int>(streakCurrent),
      'streakBest': serializer.toJson<int>(streakBest),
      'lastAdheredDate': serializer.toJson<String?>(lastAdheredDate),
    };
  }

  LocalRhythmState copyWith(
          {String? userId,
          Value<String?> lastPlanPromptDate = const Value.absent(),
          Value<String?> lastEndOfDayDate = const Value.absent(),
          Value<String?> lastMorningBriefingDate = const Value.absent(),
          bool? awaitingCheckin,
          Value<DateTime?> awaitingSince = const Value.absent(),
          int? streakCurrent,
          int? streakBest,
          Value<String?> lastAdheredDate = const Value.absent()}) =>
      LocalRhythmState(
        userId: userId ?? this.userId,
        lastPlanPromptDate: lastPlanPromptDate.present
            ? lastPlanPromptDate.value
            : this.lastPlanPromptDate,
        lastEndOfDayDate: lastEndOfDayDate.present
            ? lastEndOfDayDate.value
            : this.lastEndOfDayDate,
        lastMorningBriefingDate: lastMorningBriefingDate.present
            ? lastMorningBriefingDate.value
            : this.lastMorningBriefingDate,
        awaitingCheckin: awaitingCheckin ?? this.awaitingCheckin,
        awaitingSince:
            awaitingSince.present ? awaitingSince.value : this.awaitingSince,
        streakCurrent: streakCurrent ?? this.streakCurrent,
        streakBest: streakBest ?? this.streakBest,
        lastAdheredDate: lastAdheredDate.present
            ? lastAdheredDate.value
            : this.lastAdheredDate,
      );
  LocalRhythmState copyWithCompanion(RhythmStateCompanion data) {
    return LocalRhythmState(
      userId: data.userId.present ? data.userId.value : this.userId,
      lastPlanPromptDate: data.lastPlanPromptDate.present
          ? data.lastPlanPromptDate.value
          : this.lastPlanPromptDate,
      lastEndOfDayDate: data.lastEndOfDayDate.present
          ? data.lastEndOfDayDate.value
          : this.lastEndOfDayDate,
      lastMorningBriefingDate: data.lastMorningBriefingDate.present
          ? data.lastMorningBriefingDate.value
          : this.lastMorningBriefingDate,
      awaitingCheckin: data.awaitingCheckin.present
          ? data.awaitingCheckin.value
          : this.awaitingCheckin,
      awaitingSince: data.awaitingSince.present
          ? data.awaitingSince.value
          : this.awaitingSince,
      streakCurrent: data.streakCurrent.present
          ? data.streakCurrent.value
          : this.streakCurrent,
      streakBest:
          data.streakBest.present ? data.streakBest.value : this.streakBest,
      lastAdheredDate: data.lastAdheredDate.present
          ? data.lastAdheredDate.value
          : this.lastAdheredDate,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalRhythmState(')
          ..write('userId: $userId, ')
          ..write('lastPlanPromptDate: $lastPlanPromptDate, ')
          ..write('lastEndOfDayDate: $lastEndOfDayDate, ')
          ..write('lastMorningBriefingDate: $lastMorningBriefingDate, ')
          ..write('awaitingCheckin: $awaitingCheckin, ')
          ..write('awaitingSince: $awaitingSince, ')
          ..write('streakCurrent: $streakCurrent, ')
          ..write('streakBest: $streakBest, ')
          ..write('lastAdheredDate: $lastAdheredDate')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      userId,
      lastPlanPromptDate,
      lastEndOfDayDate,
      lastMorningBriefingDate,
      awaitingCheckin,
      awaitingSince,
      streakCurrent,
      streakBest,
      lastAdheredDate);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalRhythmState &&
          other.userId == this.userId &&
          other.lastPlanPromptDate == this.lastPlanPromptDate &&
          other.lastEndOfDayDate == this.lastEndOfDayDate &&
          other.lastMorningBriefingDate == this.lastMorningBriefingDate &&
          other.awaitingCheckin == this.awaitingCheckin &&
          other.awaitingSince == this.awaitingSince &&
          other.streakCurrent == this.streakCurrent &&
          other.streakBest == this.streakBest &&
          other.lastAdheredDate == this.lastAdheredDate);
}

class RhythmStateCompanion extends UpdateCompanion<LocalRhythmState> {
  final Value<String> userId;
  final Value<String?> lastPlanPromptDate;
  final Value<String?> lastEndOfDayDate;
  final Value<String?> lastMorningBriefingDate;
  final Value<bool> awaitingCheckin;
  final Value<DateTime?> awaitingSince;
  final Value<int> streakCurrent;
  final Value<int> streakBest;
  final Value<String?> lastAdheredDate;
  final Value<int> rowid;
  const RhythmStateCompanion({
    this.userId = const Value.absent(),
    this.lastPlanPromptDate = const Value.absent(),
    this.lastEndOfDayDate = const Value.absent(),
    this.lastMorningBriefingDate = const Value.absent(),
    this.awaitingCheckin = const Value.absent(),
    this.awaitingSince = const Value.absent(),
    this.streakCurrent = const Value.absent(),
    this.streakBest = const Value.absent(),
    this.lastAdheredDate = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RhythmStateCompanion.insert({
    required String userId,
    this.lastPlanPromptDate = const Value.absent(),
    this.lastEndOfDayDate = const Value.absent(),
    this.lastMorningBriefingDate = const Value.absent(),
    this.awaitingCheckin = const Value.absent(),
    this.awaitingSince = const Value.absent(),
    this.streakCurrent = const Value.absent(),
    this.streakBest = const Value.absent(),
    this.lastAdheredDate = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : userId = Value(userId);
  static Insertable<LocalRhythmState> custom({
    Expression<String>? userId,
    Expression<String>? lastPlanPromptDate,
    Expression<String>? lastEndOfDayDate,
    Expression<String>? lastMorningBriefingDate,
    Expression<bool>? awaitingCheckin,
    Expression<DateTime>? awaitingSince,
    Expression<int>? streakCurrent,
    Expression<int>? streakBest,
    Expression<String>? lastAdheredDate,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (lastPlanPromptDate != null)
        'last_plan_prompt_date': lastPlanPromptDate,
      if (lastEndOfDayDate != null) 'last_end_of_day_date': lastEndOfDayDate,
      if (lastMorningBriefingDate != null)
        'last_morning_briefing_date': lastMorningBriefingDate,
      if (awaitingCheckin != null) 'awaiting_checkin': awaitingCheckin,
      if (awaitingSince != null) 'awaiting_since': awaitingSince,
      if (streakCurrent != null) 'streak_current': streakCurrent,
      if (streakBest != null) 'streak_best': streakBest,
      if (lastAdheredDate != null) 'last_adhered_date': lastAdheredDate,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RhythmStateCompanion copyWith(
      {Value<String>? userId,
      Value<String?>? lastPlanPromptDate,
      Value<String?>? lastEndOfDayDate,
      Value<String?>? lastMorningBriefingDate,
      Value<bool>? awaitingCheckin,
      Value<DateTime?>? awaitingSince,
      Value<int>? streakCurrent,
      Value<int>? streakBest,
      Value<String?>? lastAdheredDate,
      Value<int>? rowid}) {
    return RhythmStateCompanion(
      userId: userId ?? this.userId,
      lastPlanPromptDate: lastPlanPromptDate ?? this.lastPlanPromptDate,
      lastEndOfDayDate: lastEndOfDayDate ?? this.lastEndOfDayDate,
      lastMorningBriefingDate:
          lastMorningBriefingDate ?? this.lastMorningBriefingDate,
      awaitingCheckin: awaitingCheckin ?? this.awaitingCheckin,
      awaitingSince: awaitingSince ?? this.awaitingSince,
      streakCurrent: streakCurrent ?? this.streakCurrent,
      streakBest: streakBest ?? this.streakBest,
      lastAdheredDate: lastAdheredDate ?? this.lastAdheredDate,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (userId.present) {
      map['user_id'] = Variable<String>(userId.value);
    }
    if (lastPlanPromptDate.present) {
      map['last_plan_prompt_date'] = Variable<String>(lastPlanPromptDate.value);
    }
    if (lastEndOfDayDate.present) {
      map['last_end_of_day_date'] = Variable<String>(lastEndOfDayDate.value);
    }
    if (lastMorningBriefingDate.present) {
      map['last_morning_briefing_date'] =
          Variable<String>(lastMorningBriefingDate.value);
    }
    if (awaitingCheckin.present) {
      map['awaiting_checkin'] = Variable<bool>(awaitingCheckin.value);
    }
    if (awaitingSince.present) {
      map['awaiting_since'] = Variable<DateTime>(awaitingSince.value);
    }
    if (streakCurrent.present) {
      map['streak_current'] = Variable<int>(streakCurrent.value);
    }
    if (streakBest.present) {
      map['streak_best'] = Variable<int>(streakBest.value);
    }
    if (lastAdheredDate.present) {
      map['last_adhered_date'] = Variable<String>(lastAdheredDate.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RhythmStateCompanion(')
          ..write('userId: $userId, ')
          ..write('lastPlanPromptDate: $lastPlanPromptDate, ')
          ..write('lastEndOfDayDate: $lastEndOfDayDate, ')
          ..write('lastMorningBriefingDate: $lastMorningBriefingDate, ')
          ..write('awaitingCheckin: $awaitingCheckin, ')
          ..write('awaitingSince: $awaitingSince, ')
          ..write('streakCurrent: $streakCurrent, ')
          ..write('streakBest: $streakBest, ')
          ..write('lastAdheredDate: $lastAdheredDate, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ConversationsTable extends Conversations
    with TableInfo<$ConversationsTable, LocalConversation> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ConversationsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
      'kind', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('free'));
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _pinnedMeta = const VerificationMeta('pinned');
  @override
  late final GeneratedColumn<bool> pinned = GeneratedColumn<bool>(
      'pinned', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("pinned" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _archivedMeta =
      const VerificationMeta('archived');
  @override
  late final GeneratedColumn<bool> archived = GeneratedColumn<bool>(
      'archived', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("archived" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _clearedUpToSeqMeta =
      const VerificationMeta('clearedUpToSeq');
  @override
  late final GeneratedColumn<int> clearedUpToSeq = GeneratedColumn<int>(
      'cleared_up_to_seq', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _lastMessageAtMeta =
      const VerificationMeta('lastMessageAt');
  @override
  late final GeneratedColumn<DateTime> lastMessageAt =
      GeneratedColumn<DateTime>('last_message_at', aliasedName, true,
          type: DriftSqlType.dateTime, requiredDuringInsert: false);
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
        kind,
        title,
        pinned,
        archived,
        clearedUpToSeq,
        lastMessageAt,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'conversations';
  @override
  VerificationContext validateIntegrity(Insertable<LocalConversation> instance,
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
    if (data.containsKey('kind')) {
      context.handle(
          _kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    }
    if (data.containsKey('pinned')) {
      context.handle(_pinnedMeta,
          pinned.isAcceptableOrUnknown(data['pinned']!, _pinnedMeta));
    }
    if (data.containsKey('archived')) {
      context.handle(_archivedMeta,
          archived.isAcceptableOrUnknown(data['archived']!, _archivedMeta));
    }
    if (data.containsKey('cleared_up_to_seq')) {
      context.handle(
          _clearedUpToSeqMeta,
          clearedUpToSeq.isAcceptableOrUnknown(
              data['cleared_up_to_seq']!, _clearedUpToSeqMeta));
    }
    if (data.containsKey('last_message_at')) {
      context.handle(
          _lastMessageAtMeta,
          lastMessageAt.isAcceptableOrUnknown(
              data['last_message_at']!, _lastMessageAtMeta));
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
  LocalConversation map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalConversation(
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
      kind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      pinned: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}pinned'])!,
      archived: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}archived'])!,
      clearedUpToSeq: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}cleared_up_to_seq'])!,
      lastMessageAt: attachedDatabase.typeMapping.read(
          DriftSqlType.dateTime, data['${effectivePrefix}last_message_at']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $ConversationsTable createAlias(String alias) {
    return $ConversationsTable(attachedDatabase, alias);
  }
}

class LocalConversation extends DataClass
    implements Insertable<LocalConversation> {
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

  /// `coach` | `planner` | `free`. Not an enum column: the set is the server's
  /// and a fourth kind from a newer gateway has to land in the row rather than
  /// fail the pull, which is what a strict local enum would do.
  final String kind;

  /// The member's own opening words for a chat that was moved here, the seeded
  /// name for the two pinned ones. Empty is legitimate — a chat created from
  /// the list before anything has been said has no title yet — so the screen
  /// falls back to a placeholder rather than this column carrying one.
  final String title;
  final bool pinned;
  final bool archived;

  /// The highest message sequence the member has cleared away.
  ///
  /// A watermark and not a delete, so clearing is idempotent and survives a
  /// device that has been away: the number is what a catching-up phone compares
  /// its own rows against. Nought means nothing has been cleared, which is why
  /// it defaults to nought rather than being nullable — "cleared up to message
  /// zero" and "never cleared" are the same statement.
  final int clearedUpToSeq;

  /// When something was last said here, for the list's ordering. Null for a
  /// chat nobody has written in.
  final DateTime? lastMessageAt;
  final DateTime createdAt;
  const LocalConversation(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.kind,
      required this.title,
      required this.pinned,
      required this.archived,
      required this.clearedUpToSeq,
      this.lastMessageAt,
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
    map['kind'] = Variable<String>(kind);
    map['title'] = Variable<String>(title);
    map['pinned'] = Variable<bool>(pinned);
    map['archived'] = Variable<bool>(archived);
    map['cleared_up_to_seq'] = Variable<int>(clearedUpToSeq);
    if (!nullToAbsent || lastMessageAt != null) {
      map['last_message_at'] = Variable<DateTime>(lastMessageAt);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  ConversationsCompanion toCompanion(bool nullToAbsent) {
    return ConversationsCompanion(
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
      kind: Value(kind),
      title: Value(title),
      pinned: Value(pinned),
      archived: Value(archived),
      clearedUpToSeq: Value(clearedUpToSeq),
      lastMessageAt: lastMessageAt == null && nullToAbsent
          ? const Value.absent()
          : Value(lastMessageAt),
      createdAt: Value(createdAt),
    );
  }

  factory LocalConversation.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalConversation(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      kind: serializer.fromJson<String>(json['kind']),
      title: serializer.fromJson<String>(json['title']),
      pinned: serializer.fromJson<bool>(json['pinned']),
      archived: serializer.fromJson<bool>(json['archived']),
      clearedUpToSeq: serializer.fromJson<int>(json['clearedUpToSeq']),
      lastMessageAt: serializer.fromJson<DateTime?>(json['lastMessageAt']),
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
      'kind': serializer.toJson<String>(kind),
      'title': serializer.toJson<String>(title),
      'pinned': serializer.toJson<bool>(pinned),
      'archived': serializer.toJson<bool>(archived),
      'clearedUpToSeq': serializer.toJson<int>(clearedUpToSeq),
      'lastMessageAt': serializer.toJson<DateTime?>(lastMessageAt),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalConversation copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? kind,
          String? title,
          bool? pinned,
          bool? archived,
          int? clearedUpToSeq,
          Value<DateTime?> lastMessageAt = const Value.absent(),
          DateTime? createdAt}) =>
      LocalConversation(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        kind: kind ?? this.kind,
        title: title ?? this.title,
        pinned: pinned ?? this.pinned,
        archived: archived ?? this.archived,
        clearedUpToSeq: clearedUpToSeq ?? this.clearedUpToSeq,
        lastMessageAt:
            lastMessageAt.present ? lastMessageAt.value : this.lastMessageAt,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalConversation copyWithCompanion(ConversationsCompanion data) {
    return LocalConversation(
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
      kind: data.kind.present ? data.kind.value : this.kind,
      title: data.title.present ? data.title.value : this.title,
      pinned: data.pinned.present ? data.pinned.value : this.pinned,
      archived: data.archived.present ? data.archived.value : this.archived,
      clearedUpToSeq: data.clearedUpToSeq.present
          ? data.clearedUpToSeq.value
          : this.clearedUpToSeq,
      lastMessageAt: data.lastMessageAt.present
          ? data.lastMessageAt.value
          : this.lastMessageAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalConversation(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('pinned: $pinned, ')
          ..write('archived: $archived, ')
          ..write('clearedUpToSeq: $clearedUpToSeq, ')
          ..write('lastMessageAt: $lastMessageAt, ')
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
      kind,
      title,
      pinned,
      archived,
      clearedUpToSeq,
      lastMessageAt,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalConversation &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.kind == this.kind &&
          other.title == this.title &&
          other.pinned == this.pinned &&
          other.archived == this.archived &&
          other.clearedUpToSeq == this.clearedUpToSeq &&
          other.lastMessageAt == this.lastMessageAt &&
          other.createdAt == this.createdAt);
}

class ConversationsCompanion extends UpdateCompanion<LocalConversation> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> kind;
  final Value<String> title;
  final Value<bool> pinned;
  final Value<bool> archived;
  final Value<int> clearedUpToSeq;
  final Value<DateTime?> lastMessageAt;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const ConversationsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.pinned = const Value.absent(),
    this.archived = const Value.absent(),
    this.clearedUpToSeq = const Value.absent(),
    this.lastMessageAt = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ConversationsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.pinned = const Value.absent(),
    this.archived = const Value.absent(),
    this.clearedUpToSeq = const Value.absent(),
    this.lastMessageAt = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        createdAt = Value(createdAt);
  static Insertable<LocalConversation> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? kind,
    Expression<String>? title,
    Expression<bool>? pinned,
    Expression<bool>? archived,
    Expression<int>? clearedUpToSeq,
    Expression<DateTime>? lastMessageAt,
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
      if (kind != null) 'kind': kind,
      if (title != null) 'title': title,
      if (pinned != null) 'pinned': pinned,
      if (archived != null) 'archived': archived,
      if (clearedUpToSeq != null) 'cleared_up_to_seq': clearedUpToSeq,
      if (lastMessageAt != null) 'last_message_at': lastMessageAt,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ConversationsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? kind,
      Value<String>? title,
      Value<bool>? pinned,
      Value<bool>? archived,
      Value<int>? clearedUpToSeq,
      Value<DateTime?>? lastMessageAt,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return ConversationsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      pinned: pinned ?? this.pinned,
      archived: archived ?? this.archived,
      clearedUpToSeq: clearedUpToSeq ?? this.clearedUpToSeq,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
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
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (pinned.present) {
      map['pinned'] = Variable<bool>(pinned.value);
    }
    if (archived.present) {
      map['archived'] = Variable<bool>(archived.value);
    }
    if (clearedUpToSeq.present) {
      map['cleared_up_to_seq'] = Variable<int>(clearedUpToSeq.value);
    }
    if (lastMessageAt.present) {
      map['last_message_at'] = Variable<DateTime>(lastMessageAt.value);
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
    return (StringBuffer('ConversationsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('pinned: $pinned, ')
          ..write('archived: $archived, ')
          ..write('clearedUpToSeq: $clearedUpToSeq, ')
          ..write('lastMessageAt: $lastMessageAt, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MessagesTable extends Messages
    with TableInfo<$MessagesTable, LocalMessage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _seqMeta = const VerificationMeta('seq');
  @override
  late final GeneratedColumn<int> seq = GeneratedColumn<int>(
      'seq', aliasedName, false,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _conversationIdMeta =
      const VerificationMeta('conversationId');
  @override
  late final GeneratedColumn<String> conversationId = GeneratedColumn<String>(
      'conversation_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _roleMeta = const VerificationMeta('role');
  @override
  late final GeneratedColumn<String> role = GeneratedColumn<String>(
      'role', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _contentMeta =
      const VerificationMeta('content');
  @override
  late final GeneratedColumn<String> content = GeneratedColumn<String>(
      'content', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _clientIdMeta =
      const VerificationMeta('clientId');
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _composedAtMeta =
      const VerificationMeta('composedAt');
  @override
  late final GeneratedColumn<DateTime> composedAt = GeneratedColumn<DateTime>(
      'composed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _createdAtMeta =
      const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
      'created_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [seq, conversationId, role, content, clientId, composedAt, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'messages';
  @override
  VerificationContext validateIntegrity(Insertable<LocalMessage> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('seq')) {
      context.handle(
          _seqMeta, seq.isAcceptableOrUnknown(data['seq']!, _seqMeta));
    }
    if (data.containsKey('conversation_id')) {
      context.handle(
          _conversationIdMeta,
          conversationId.isAcceptableOrUnknown(
              data['conversation_id']!, _conversationIdMeta));
    } else if (isInserting) {
      context.missing(_conversationIdMeta);
    }
    if (data.containsKey('role')) {
      context.handle(
          _roleMeta, role.isAcceptableOrUnknown(data['role']!, _roleMeta));
    } else if (isInserting) {
      context.missing(_roleMeta);
    }
    if (data.containsKey('content')) {
      context.handle(_contentMeta,
          content.isAcceptableOrUnknown(data['content']!, _contentMeta));
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('client_id')) {
      context.handle(_clientIdMeta,
          clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));
    }
    if (data.containsKey('composed_at')) {
      context.handle(
          _composedAtMeta,
          composedAt.isAcceptableOrUnknown(
              data['composed_at']!, _composedAtMeta));
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
  Set<GeneratedColumn> get $primaryKey => {seq};
  @override
  LocalMessage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalMessage(
      seq: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}seq'])!,
      conversationId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}conversation_id'])!,
      role: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}role'])!,
      content: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}content'])!,
      clientId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}client_id']),
      composedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}composed_at']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $MessagesTable createAlias(String alias) {
    return $MessagesTable(attachedDatabase, alias);
  }
}

class LocalMessage extends DataClass implements Insertable<LocalMessage> {
  /// The member's own monotonic sequence, issued by the server's `counters`
  /// document. Unique per member, so it is unique on a device that holds one
  /// member's rows.
  final int seq;
  final String conversationId;

  /// `user` | `assistant` | `system`. A text column for the reason
  /// [Conversations.kind] gives.
  final String role;
  final String content;

  /// The id this device minted for a message it composed, or null for anything
  /// the server wrote — an answer, the evening prompt, a system note.
  final String? clientId;

  /// When the member typed it, which is **not** when it was understood.
  ///
  /// FR-007: a message composed offline is delivered later and interpreted as
  /// of when it was typed, so "remind me in two hours" written at 14:10 and
  /// flushed at 19:00 is still a reminder for 16:10. Null for anything the
  /// server wrote.
  final DateTime? composedAt;
  final DateTime createdAt;
  const LocalMessage(
      {required this.seq,
      required this.conversationId,
      required this.role,
      required this.content,
      this.clientId,
      this.composedAt,
      required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['seq'] = Variable<int>(seq);
    map['conversation_id'] = Variable<String>(conversationId);
    map['role'] = Variable<String>(role);
    map['content'] = Variable<String>(content);
    if (!nullToAbsent || clientId != null) {
      map['client_id'] = Variable<String>(clientId);
    }
    if (!nullToAbsent || composedAt != null) {
      map['composed_at'] = Variable<DateTime>(composedAt);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  MessagesCompanion toCompanion(bool nullToAbsent) {
    return MessagesCompanion(
      seq: Value(seq),
      conversationId: Value(conversationId),
      role: Value(role),
      content: Value(content),
      clientId: clientId == null && nullToAbsent
          ? const Value.absent()
          : Value(clientId),
      composedAt: composedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(composedAt),
      createdAt: Value(createdAt),
    );
  }

  factory LocalMessage.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalMessage(
      seq: serializer.fromJson<int>(json['seq']),
      conversationId: serializer.fromJson<String>(json['conversationId']),
      role: serializer.fromJson<String>(json['role']),
      content: serializer.fromJson<String>(json['content']),
      clientId: serializer.fromJson<String?>(json['clientId']),
      composedAt: serializer.fromJson<DateTime?>(json['composedAt']),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'seq': serializer.toJson<int>(seq),
      'conversationId': serializer.toJson<String>(conversationId),
      'role': serializer.toJson<String>(role),
      'content': serializer.toJson<String>(content),
      'clientId': serializer.toJson<String?>(clientId),
      'composedAt': serializer.toJson<DateTime?>(composedAt),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalMessage copyWith(
          {int? seq,
          String? conversationId,
          String? role,
          String? content,
          Value<String?> clientId = const Value.absent(),
          Value<DateTime?> composedAt = const Value.absent(),
          DateTime? createdAt}) =>
      LocalMessage(
        seq: seq ?? this.seq,
        conversationId: conversationId ?? this.conversationId,
        role: role ?? this.role,
        content: content ?? this.content,
        clientId: clientId.present ? clientId.value : this.clientId,
        composedAt: composedAt.present ? composedAt.value : this.composedAt,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalMessage copyWithCompanion(MessagesCompanion data) {
    return LocalMessage(
      seq: data.seq.present ? data.seq.value : this.seq,
      conversationId: data.conversationId.present
          ? data.conversationId.value
          : this.conversationId,
      role: data.role.present ? data.role.value : this.role,
      content: data.content.present ? data.content.value : this.content,
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      composedAt:
          data.composedAt.present ? data.composedAt.value : this.composedAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalMessage(')
          ..write('seq: $seq, ')
          ..write('conversationId: $conversationId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('clientId: $clientId, ')
          ..write('composedAt: $composedAt, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      seq, conversationId, role, content, clientId, composedAt, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalMessage &&
          other.seq == this.seq &&
          other.conversationId == this.conversationId &&
          other.role == this.role &&
          other.content == this.content &&
          other.clientId == this.clientId &&
          other.composedAt == this.composedAt &&
          other.createdAt == this.createdAt);
}

class MessagesCompanion extends UpdateCompanion<LocalMessage> {
  final Value<int> seq;
  final Value<String> conversationId;
  final Value<String> role;
  final Value<String> content;
  final Value<String?> clientId;
  final Value<DateTime?> composedAt;
  final Value<DateTime> createdAt;
  const MessagesCompanion({
    this.seq = const Value.absent(),
    this.conversationId = const Value.absent(),
    this.role = const Value.absent(),
    this.content = const Value.absent(),
    this.clientId = const Value.absent(),
    this.composedAt = const Value.absent(),
    this.createdAt = const Value.absent(),
  });
  MessagesCompanion.insert({
    this.seq = const Value.absent(),
    required String conversationId,
    required String role,
    required String content,
    this.clientId = const Value.absent(),
    this.composedAt = const Value.absent(),
    required DateTime createdAt,
  })  : conversationId = Value(conversationId),
        role = Value(role),
        content = Value(content),
        createdAt = Value(createdAt);
  static Insertable<LocalMessage> custom({
    Expression<int>? seq,
    Expression<String>? conversationId,
    Expression<String>? role,
    Expression<String>? content,
    Expression<String>? clientId,
    Expression<DateTime>? composedAt,
    Expression<DateTime>? createdAt,
  }) {
    return RawValuesInsertable({
      if (seq != null) 'seq': seq,
      if (conversationId != null) 'conversation_id': conversationId,
      if (role != null) 'role': role,
      if (content != null) 'content': content,
      if (clientId != null) 'client_id': clientId,
      if (composedAt != null) 'composed_at': composedAt,
      if (createdAt != null) 'created_at': createdAt,
    });
  }

  MessagesCompanion copyWith(
      {Value<int>? seq,
      Value<String>? conversationId,
      Value<String>? role,
      Value<String>? content,
      Value<String?>? clientId,
      Value<DateTime?>? composedAt,
      Value<DateTime>? createdAt}) {
    return MessagesCompanion(
      seq: seq ?? this.seq,
      conversationId: conversationId ?? this.conversationId,
      role: role ?? this.role,
      content: content ?? this.content,
      clientId: clientId ?? this.clientId,
      composedAt: composedAt ?? this.composedAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (seq.present) {
      map['seq'] = Variable<int>(seq.value);
    }
    if (conversationId.present) {
      map['conversation_id'] = Variable<String>(conversationId.value);
    }
    if (role.present) {
      map['role'] = Variable<String>(role.value);
    }
    if (content.present) {
      map['content'] = Variable<String>(content.value);
    }
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (composedAt.present) {
      map['composed_at'] = Variable<DateTime>(composedAt.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MessagesCompanion(')
          ..write('seq: $seq, ')
          ..write('conversationId: $conversationId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('clientId: $clientId, ')
          ..write('composedAt: $composedAt, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }
}

class $PendingMessagesTable extends PendingMessages
    with TableInfo<$PendingMessagesTable, LocalPendingMessage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PendingMessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _clientIdMeta =
      const VerificationMeta('clientId');
  @override
  late final GeneratedColumn<String> clientId = GeneratedColumn<String>(
      'client_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _conversationIdMeta =
      const VerificationMeta('conversationId');
  @override
  late final GeneratedColumn<String> conversationId = GeneratedColumn<String>(
      'conversation_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _bodyMeta = const VerificationMeta('body');
  @override
  late final GeneratedColumn<String> body = GeneratedColumn<String>(
      'body', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _composedAtMeta =
      const VerificationMeta('composedAt');
  @override
  late final GeneratedColumn<DateTime> composedAt = GeneratedColumn<DateTime>(
      'composed_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _attemptsMeta =
      const VerificationMeta('attempts');
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
      'attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  @override
  List<GeneratedColumn> get $columns =>
      [clientId, conversationId, body, composedAt, attempts];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_messages';
  @override
  VerificationContext validateIntegrity(
      Insertable<LocalPendingMessage> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('client_id')) {
      context.handle(_clientIdMeta,
          clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));
    } else if (isInserting) {
      context.missing(_clientIdMeta);
    }
    if (data.containsKey('conversation_id')) {
      context.handle(
          _conversationIdMeta,
          conversationId.isAcceptableOrUnknown(
              data['conversation_id']!, _conversationIdMeta));
    } else if (isInserting) {
      context.missing(_conversationIdMeta);
    }
    if (data.containsKey('body')) {
      context.handle(
          _bodyMeta, body.isAcceptableOrUnknown(data['body']!, _bodyMeta));
    } else if (isInserting) {
      context.missing(_bodyMeta);
    }
    if (data.containsKey('composed_at')) {
      context.handle(
          _composedAtMeta,
          composedAt.isAcceptableOrUnknown(
              data['composed_at']!, _composedAtMeta));
    } else if (isInserting) {
      context.missing(_composedAtMeta);
    }
    if (data.containsKey('attempts')) {
      context.handle(_attemptsMeta,
          attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {clientId};
  @override
  LocalPendingMessage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalPendingMessage(
      clientId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}client_id'])!,
      conversationId: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}conversation_id'])!,
      body: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}body'])!,
      composedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}composed_at'])!,
      attempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}attempts'])!,
    );
  }

  @override
  $PendingMessagesTable createAlias(String alias) {
    return $PendingMessagesTable(attachedDatabase, alias);
  }
}

class LocalPendingMessage extends DataClass
    implements Insertable<LocalPendingMessage> {
  /// Client-minted UUIDv7, so a flush retried after a half-delivered request is
  /// a no-op on the server rather than a second copy of the sentence.
  final String clientId;
  final String conversationId;

  /// Named `body` and not `text`, because `text()` is drift's own column
  /// builder and a getter called `text` shadows it into infinite recursion.
  final String body;

  /// When the member typed it. Not nullable here, unlike [Messages.composedAt]:
  /// a row in this table exists *because* somebody typed it, and the whole
  /// point of the batch flush is that the server is told when.
  final DateTime composedAt;

  /// How many flushes have failed for this row.
  ///
  /// Capped for the reason the sync engine gives for its own cap: the row is
  /// never discarded — that would be the app quietly deciding somebody's
  /// sentence was not worth keeping — but it does stop being re-sent, so a
  /// message the server refuses for a reason retrying cannot fix does not flush
  /// on every reconnection for the life of the install.
  final int attempts;
  const LocalPendingMessage(
      {required this.clientId,
      required this.conversationId,
      required this.body,
      required this.composedAt,
      required this.attempts});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['client_id'] = Variable<String>(clientId);
    map['conversation_id'] = Variable<String>(conversationId);
    map['body'] = Variable<String>(body);
    map['composed_at'] = Variable<DateTime>(composedAt);
    map['attempts'] = Variable<int>(attempts);
    return map;
  }

  PendingMessagesCompanion toCompanion(bool nullToAbsent) {
    return PendingMessagesCompanion(
      clientId: Value(clientId),
      conversationId: Value(conversationId),
      body: Value(body),
      composedAt: Value(composedAt),
      attempts: Value(attempts),
    );
  }

  factory LocalPendingMessage.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalPendingMessage(
      clientId: serializer.fromJson<String>(json['clientId']),
      conversationId: serializer.fromJson<String>(json['conversationId']),
      body: serializer.fromJson<String>(json['body']),
      composedAt: serializer.fromJson<DateTime>(json['composedAt']),
      attempts: serializer.fromJson<int>(json['attempts']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'clientId': serializer.toJson<String>(clientId),
      'conversationId': serializer.toJson<String>(conversationId),
      'body': serializer.toJson<String>(body),
      'composedAt': serializer.toJson<DateTime>(composedAt),
      'attempts': serializer.toJson<int>(attempts),
    };
  }

  LocalPendingMessage copyWith(
          {String? clientId,
          String? conversationId,
          String? body,
          DateTime? composedAt,
          int? attempts}) =>
      LocalPendingMessage(
        clientId: clientId ?? this.clientId,
        conversationId: conversationId ?? this.conversationId,
        body: body ?? this.body,
        composedAt: composedAt ?? this.composedAt,
        attempts: attempts ?? this.attempts,
      );
  LocalPendingMessage copyWithCompanion(PendingMessagesCompanion data) {
    return LocalPendingMessage(
      clientId: data.clientId.present ? data.clientId.value : this.clientId,
      conversationId: data.conversationId.present
          ? data.conversationId.value
          : this.conversationId,
      body: data.body.present ? data.body.value : this.body,
      composedAt:
          data.composedAt.present ? data.composedAt.value : this.composedAt,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalPendingMessage(')
          ..write('clientId: $clientId, ')
          ..write('conversationId: $conversationId, ')
          ..write('body: $body, ')
          ..write('composedAt: $composedAt, ')
          ..write('attempts: $attempts')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(clientId, conversationId, body, composedAt, attempts);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalPendingMessage &&
          other.clientId == this.clientId &&
          other.conversationId == this.conversationId &&
          other.body == this.body &&
          other.composedAt == this.composedAt &&
          other.attempts == this.attempts);
}

class PendingMessagesCompanion extends UpdateCompanion<LocalPendingMessage> {
  final Value<String> clientId;
  final Value<String> conversationId;
  final Value<String> body;
  final Value<DateTime> composedAt;
  final Value<int> attempts;
  final Value<int> rowid;
  const PendingMessagesCompanion({
    this.clientId = const Value.absent(),
    this.conversationId = const Value.absent(),
    this.body = const Value.absent(),
    this.composedAt = const Value.absent(),
    this.attempts = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingMessagesCompanion.insert({
    required String clientId,
    required String conversationId,
    required String body,
    required DateTime composedAt,
    this.attempts = const Value.absent(),
    this.rowid = const Value.absent(),
  })  : clientId = Value(clientId),
        conversationId = Value(conversationId),
        body = Value(body),
        composedAt = Value(composedAt);
  static Insertable<LocalPendingMessage> custom({
    Expression<String>? clientId,
    Expression<String>? conversationId,
    Expression<String>? body,
    Expression<DateTime>? composedAt,
    Expression<int>? attempts,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (clientId != null) 'client_id': clientId,
      if (conversationId != null) 'conversation_id': conversationId,
      if (body != null) 'body': body,
      if (composedAt != null) 'composed_at': composedAt,
      if (attempts != null) 'attempts': attempts,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingMessagesCompanion copyWith(
      {Value<String>? clientId,
      Value<String>? conversationId,
      Value<String>? body,
      Value<DateTime>? composedAt,
      Value<int>? attempts,
      Value<int>? rowid}) {
    return PendingMessagesCompanion(
      clientId: clientId ?? this.clientId,
      conversationId: conversationId ?? this.conversationId,
      body: body ?? this.body,
      composedAt: composedAt ?? this.composedAt,
      attempts: attempts ?? this.attempts,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (clientId.present) {
      map['client_id'] = Variable<String>(clientId.value);
    }
    if (conversationId.present) {
      map['conversation_id'] = Variable<String>(conversationId.value);
    }
    if (body.present) {
      map['body'] = Variable<String>(body.value);
    }
    if (composedAt.present) {
      map['composed_at'] = Variable<DateTime>(composedAt.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingMessagesCompanion(')
          ..write('clientId: $clientId, ')
          ..write('conversationId: $conversationId, ')
          ..write('body: $body, ')
          ..write('composedAt: $composedAt, ')
          ..write('attempts: $attempts, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MeetingsTable extends Meetings
    with TableInfo<$MeetingsTable, LocalMeeting> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MeetingsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _descriptionMeta =
      const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
      'description', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _startAtMeta =
      const VerificationMeta('startAt');
  @override
  late final GeneratedColumn<DateTime> startAt = GeneratedColumn<DateTime>(
      'start_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _durationMinMeta =
      const VerificationMeta('durationMin');
  @override
  late final GeneratedColumn<int> durationMin = GeneratedColumn<int>(
      'duration_min', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(30));
  static const VerificationMeta _allDayMeta = const VerificationMeta('allDay');
  @override
  late final GeneratedColumn<bool> allDay = GeneratedColumn<bool>(
      'all_day', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("all_day" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _lockTimezoneMeta =
      const VerificationMeta('lockTimezone');
  @override
  late final GeneratedColumn<String> lockTimezone = GeneratedColumn<String>(
      'lock_timezone', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _authoredTimezoneMeta =
      const VerificationMeta('authoredTimezone');
  @override
  late final GeneratedColumn<String> authoredTimezone = GeneratedColumn<String>(
      'authored_timezone', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
  static const VerificationMeta _locationJsonMeta =
      const VerificationMeta('locationJson');
  @override
  late final GeneratedColumn<String> locationJson = GeneratedColumn<String>(
      'location_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _prepNotesMeta =
      const VerificationMeta('prepNotes');
  @override
  late final GeneratedColumn<String> prepNotes = GeneratedColumn<String>(
      'prep_notes', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _prepMinutesMeta =
      const VerificationMeta('prepMinutes');
  @override
  late final GeneratedColumn<int> prepMinutes = GeneratedColumn<int>(
      'prep_minutes', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _reminderOffsetsJsonMeta =
      const VerificationMeta('reminderOffsetsJson');
  @override
  late final GeneratedColumn<String> reminderOffsetsJson =
      GeneratedColumn<String>('reminder_offsets_json', aliasedName, false,
          type: DriftSqlType.string,
          requiredDuringInsert: false,
          defaultValue: const Constant('[]'));
  static const VerificationMeta _recurrenceJsonMeta =
      const VerificationMeta('recurrenceJson');
  @override
  late final GeneratedColumn<String> recurrenceJson = GeneratedColumn<String>(
      'recurrence_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('scheduled'));
  static const VerificationMeta _completedAtMeta =
      const VerificationMeta('completedAt');
  @override
  late final GeneratedColumn<DateTime> completedAt = GeneratedColumn<DateTime>(
      'completed_at', aliasedName, true,
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
        description,
        startAt,
        durationMin,
        allDay,
        lockTimezone,
        authoredTimezone,
        locationJson,
        prepNotes,
        prepMinutes,
        reminderOffsetsJson,
        recurrenceJson,
        status,
        completedAt,
        source,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'meetings';
  @override
  VerificationContext validateIntegrity(Insertable<LocalMeeting> instance,
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
    if (data.containsKey('description')) {
      context.handle(
          _descriptionMeta,
          description.isAcceptableOrUnknown(
              data['description']!, _descriptionMeta));
    }
    if (data.containsKey('start_at')) {
      context.handle(_startAtMeta,
          startAt.isAcceptableOrUnknown(data['start_at']!, _startAtMeta));
    } else if (isInserting) {
      context.missing(_startAtMeta);
    }
    if (data.containsKey('duration_min')) {
      context.handle(
          _durationMinMeta,
          durationMin.isAcceptableOrUnknown(
              data['duration_min']!, _durationMinMeta));
    }
    if (data.containsKey('all_day')) {
      context.handle(_allDayMeta,
          allDay.isAcceptableOrUnknown(data['all_day']!, _allDayMeta));
    }
    if (data.containsKey('lock_timezone')) {
      context.handle(
          _lockTimezoneMeta,
          lockTimezone.isAcceptableOrUnknown(
              data['lock_timezone']!, _lockTimezoneMeta));
    }
    if (data.containsKey('authored_timezone')) {
      context.handle(
          _authoredTimezoneMeta,
          authoredTimezone.isAcceptableOrUnknown(
              data['authored_timezone']!, _authoredTimezoneMeta));
    }
    if (data.containsKey('location_json')) {
      context.handle(
          _locationJsonMeta,
          locationJson.isAcceptableOrUnknown(
              data['location_json']!, _locationJsonMeta));
    }
    if (data.containsKey('prep_notes')) {
      context.handle(_prepNotesMeta,
          prepNotes.isAcceptableOrUnknown(data['prep_notes']!, _prepNotesMeta));
    }
    if (data.containsKey('prep_minutes')) {
      context.handle(
          _prepMinutesMeta,
          prepMinutes.isAcceptableOrUnknown(
              data['prep_minutes']!, _prepMinutesMeta));
    }
    if (data.containsKey('reminder_offsets_json')) {
      context.handle(
          _reminderOffsetsJsonMeta,
          reminderOffsetsJson.isAcceptableOrUnknown(
              data['reminder_offsets_json']!, _reminderOffsetsJsonMeta));
    }
    if (data.containsKey('recurrence_json')) {
      context.handle(
          _recurrenceJsonMeta,
          recurrenceJson.isAcceptableOrUnknown(
              data['recurrence_json']!, _recurrenceJsonMeta));
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
  LocalMeeting map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalMeeting(
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
      description: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}description']),
      startAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}start_at'])!,
      durationMin: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}duration_min'])!,
      allDay: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}all_day'])!,
      lockTimezone: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}lock_timezone']),
      authoredTimezone: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}authored_timezone'])!,
      locationJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}location_json']),
      prepNotes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}prep_notes']),
      prepMinutes: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}prep_minutes'])!,
      reminderOffsetsJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string,
          data['${effectivePrefix}reminder_offsets_json'])!,
      recurrenceJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}recurrence_json']),
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      completedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}completed_at']),
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $MeetingsTable createAlias(String alias) {
    return $MeetingsTable(attachedDatabase, alias);
  }
}

class LocalMeeting extends DataClass implements Insertable<LocalMeeting> {
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
  final String? description;

  /// The instant the member placed. For a series this is also what
  /// `recurrence.dtstart` anchors on, and the expander re-reads its wall clock
  /// rather than trusting the instant — see [authoredTimezone].
  final DateTime startAt;
  final int durationMin;

  /// On the row because the server's document carries it, and unread here for
  /// the same reason: a whole-day entry is a [CalendarEvents] row (FR-001).
  final bool allDay;

  /// The zone this series is pinned to, or null to follow the member (FR-007).
  final String? lockTimezone;

  /// The zone whose clock the member was reading when they wrote this. Never
  /// written by the phone; see the class note.
  final String authoredTimezone;

  /// `{onlineLink, address}`, as the server sent it.
  final String? locationJson;
  final String? prepNotes;
  final int prepMinutes;

  /// JSON array of minutes before the occurrence, e.g. `[1440,30]`.
  final String reminderOffsetsJson;

  /// `{dtstart, rrule, exdates[], overrides[]}` or null. See the class note.
  final String? recurrenceJson;

  /// `scheduled` | `completed` | `cancelled`. A delete never touches it: the
  /// status is the only record of whether the meeting happened, was called off
  /// or was simply removed from the diary.
  final String status;
  final DateTime? completedAt;

  /// `app` | `chat` | `extension`.
  final String source;
  final DateTime createdAt;
  const LocalMeeting(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.title,
      this.description,
      required this.startAt,
      required this.durationMin,
      required this.allDay,
      this.lockTimezone,
      required this.authoredTimezone,
      this.locationJson,
      this.prepNotes,
      required this.prepMinutes,
      required this.reminderOffsetsJson,
      this.recurrenceJson,
      required this.status,
      this.completedAt,
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
    if (!nullToAbsent || description != null) {
      map['description'] = Variable<String>(description);
    }
    map['start_at'] = Variable<DateTime>(startAt);
    map['duration_min'] = Variable<int>(durationMin);
    map['all_day'] = Variable<bool>(allDay);
    if (!nullToAbsent || lockTimezone != null) {
      map['lock_timezone'] = Variable<String>(lockTimezone);
    }
    map['authored_timezone'] = Variable<String>(authoredTimezone);
    if (!nullToAbsent || locationJson != null) {
      map['location_json'] = Variable<String>(locationJson);
    }
    if (!nullToAbsent || prepNotes != null) {
      map['prep_notes'] = Variable<String>(prepNotes);
    }
    map['prep_minutes'] = Variable<int>(prepMinutes);
    map['reminder_offsets_json'] = Variable<String>(reminderOffsetsJson);
    if (!nullToAbsent || recurrenceJson != null) {
      map['recurrence_json'] = Variable<String>(recurrenceJson);
    }
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || completedAt != null) {
      map['completed_at'] = Variable<DateTime>(completedAt);
    }
    map['source'] = Variable<String>(source);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  MeetingsCompanion toCompanion(bool nullToAbsent) {
    return MeetingsCompanion(
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
      description: description == null && nullToAbsent
          ? const Value.absent()
          : Value(description),
      startAt: Value(startAt),
      durationMin: Value(durationMin),
      allDay: Value(allDay),
      lockTimezone: lockTimezone == null && nullToAbsent
          ? const Value.absent()
          : Value(lockTimezone),
      authoredTimezone: Value(authoredTimezone),
      locationJson: locationJson == null && nullToAbsent
          ? const Value.absent()
          : Value(locationJson),
      prepNotes: prepNotes == null && nullToAbsent
          ? const Value.absent()
          : Value(prepNotes),
      prepMinutes: Value(prepMinutes),
      reminderOffsetsJson: Value(reminderOffsetsJson),
      recurrenceJson: recurrenceJson == null && nullToAbsent
          ? const Value.absent()
          : Value(recurrenceJson),
      status: Value(status),
      completedAt: completedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(completedAt),
      source: Value(source),
      createdAt: Value(createdAt),
    );
  }

  factory LocalMeeting.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalMeeting(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      title: serializer.fromJson<String>(json['title']),
      description: serializer.fromJson<String?>(json['description']),
      startAt: serializer.fromJson<DateTime>(json['startAt']),
      durationMin: serializer.fromJson<int>(json['durationMin']),
      allDay: serializer.fromJson<bool>(json['allDay']),
      lockTimezone: serializer.fromJson<String?>(json['lockTimezone']),
      authoredTimezone: serializer.fromJson<String>(json['authoredTimezone']),
      locationJson: serializer.fromJson<String?>(json['locationJson']),
      prepNotes: serializer.fromJson<String?>(json['prepNotes']),
      prepMinutes: serializer.fromJson<int>(json['prepMinutes']),
      reminderOffsetsJson:
          serializer.fromJson<String>(json['reminderOffsetsJson']),
      recurrenceJson: serializer.fromJson<String?>(json['recurrenceJson']),
      status: serializer.fromJson<String>(json['status']),
      completedAt: serializer.fromJson<DateTime?>(json['completedAt']),
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
      'description': serializer.toJson<String?>(description),
      'startAt': serializer.toJson<DateTime>(startAt),
      'durationMin': serializer.toJson<int>(durationMin),
      'allDay': serializer.toJson<bool>(allDay),
      'lockTimezone': serializer.toJson<String?>(lockTimezone),
      'authoredTimezone': serializer.toJson<String>(authoredTimezone),
      'locationJson': serializer.toJson<String?>(locationJson),
      'prepNotes': serializer.toJson<String?>(prepNotes),
      'prepMinutes': serializer.toJson<int>(prepMinutes),
      'reminderOffsetsJson': serializer.toJson<String>(reminderOffsetsJson),
      'recurrenceJson': serializer.toJson<String?>(recurrenceJson),
      'status': serializer.toJson<String>(status),
      'completedAt': serializer.toJson<DateTime?>(completedAt),
      'source': serializer.toJson<String>(source),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalMeeting copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? title,
          Value<String?> description = const Value.absent(),
          DateTime? startAt,
          int? durationMin,
          bool? allDay,
          Value<String?> lockTimezone = const Value.absent(),
          String? authoredTimezone,
          Value<String?> locationJson = const Value.absent(),
          Value<String?> prepNotes = const Value.absent(),
          int? prepMinutes,
          String? reminderOffsetsJson,
          Value<String?> recurrenceJson = const Value.absent(),
          String? status,
          Value<DateTime?> completedAt = const Value.absent(),
          String? source,
          DateTime? createdAt}) =>
      LocalMeeting(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        title: title ?? this.title,
        description: description.present ? description.value : this.description,
        startAt: startAt ?? this.startAt,
        durationMin: durationMin ?? this.durationMin,
        allDay: allDay ?? this.allDay,
        lockTimezone:
            lockTimezone.present ? lockTimezone.value : this.lockTimezone,
        authoredTimezone: authoredTimezone ?? this.authoredTimezone,
        locationJson:
            locationJson.present ? locationJson.value : this.locationJson,
        prepNotes: prepNotes.present ? prepNotes.value : this.prepNotes,
        prepMinutes: prepMinutes ?? this.prepMinutes,
        reminderOffsetsJson: reminderOffsetsJson ?? this.reminderOffsetsJson,
        recurrenceJson:
            recurrenceJson.present ? recurrenceJson.value : this.recurrenceJson,
        status: status ?? this.status,
        completedAt: completedAt.present ? completedAt.value : this.completedAt,
        source: source ?? this.source,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalMeeting copyWithCompanion(MeetingsCompanion data) {
    return LocalMeeting(
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
      description:
          data.description.present ? data.description.value : this.description,
      startAt: data.startAt.present ? data.startAt.value : this.startAt,
      durationMin:
          data.durationMin.present ? data.durationMin.value : this.durationMin,
      allDay: data.allDay.present ? data.allDay.value : this.allDay,
      lockTimezone: data.lockTimezone.present
          ? data.lockTimezone.value
          : this.lockTimezone,
      authoredTimezone: data.authoredTimezone.present
          ? data.authoredTimezone.value
          : this.authoredTimezone,
      locationJson: data.locationJson.present
          ? data.locationJson.value
          : this.locationJson,
      prepNotes: data.prepNotes.present ? data.prepNotes.value : this.prepNotes,
      prepMinutes:
          data.prepMinutes.present ? data.prepMinutes.value : this.prepMinutes,
      reminderOffsetsJson: data.reminderOffsetsJson.present
          ? data.reminderOffsetsJson.value
          : this.reminderOffsetsJson,
      recurrenceJson: data.recurrenceJson.present
          ? data.recurrenceJson.value
          : this.recurrenceJson,
      status: data.status.present ? data.status.value : this.status,
      completedAt:
          data.completedAt.present ? data.completedAt.value : this.completedAt,
      source: data.source.present ? data.source.value : this.source,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalMeeting(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('description: $description, ')
          ..write('startAt: $startAt, ')
          ..write('durationMin: $durationMin, ')
          ..write('allDay: $allDay, ')
          ..write('lockTimezone: $lockTimezone, ')
          ..write('authoredTimezone: $authoredTimezone, ')
          ..write('locationJson: $locationJson, ')
          ..write('prepNotes: $prepNotes, ')
          ..write('prepMinutes: $prepMinutes, ')
          ..write('reminderOffsetsJson: $reminderOffsetsJson, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
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
        description,
        startAt,
        durationMin,
        allDay,
        lockTimezone,
        authoredTimezone,
        locationJson,
        prepNotes,
        prepMinutes,
        reminderOffsetsJson,
        recurrenceJson,
        status,
        completedAt,
        source,
        createdAt
      ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalMeeting &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.title == this.title &&
          other.description == this.description &&
          other.startAt == this.startAt &&
          other.durationMin == this.durationMin &&
          other.allDay == this.allDay &&
          other.lockTimezone == this.lockTimezone &&
          other.authoredTimezone == this.authoredTimezone &&
          other.locationJson == this.locationJson &&
          other.prepNotes == this.prepNotes &&
          other.prepMinutes == this.prepMinutes &&
          other.reminderOffsetsJson == this.reminderOffsetsJson &&
          other.recurrenceJson == this.recurrenceJson &&
          other.status == this.status &&
          other.completedAt == this.completedAt &&
          other.source == this.source &&
          other.createdAt == this.createdAt);
}

class MeetingsCompanion extends UpdateCompanion<LocalMeeting> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> title;
  final Value<String?> description;
  final Value<DateTime> startAt;
  final Value<int> durationMin;
  final Value<bool> allDay;
  final Value<String?> lockTimezone;
  final Value<String> authoredTimezone;
  final Value<String?> locationJson;
  final Value<String?> prepNotes;
  final Value<int> prepMinutes;
  final Value<String> reminderOffsetsJson;
  final Value<String?> recurrenceJson;
  final Value<String> status;
  final Value<DateTime?> completedAt;
  final Value<String> source;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const MeetingsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.title = const Value.absent(),
    this.description = const Value.absent(),
    this.startAt = const Value.absent(),
    this.durationMin = const Value.absent(),
    this.allDay = const Value.absent(),
    this.lockTimezone = const Value.absent(),
    this.authoredTimezone = const Value.absent(),
    this.locationJson = const Value.absent(),
    this.prepNotes = const Value.absent(),
    this.prepMinutes = const Value.absent(),
    this.reminderOffsetsJson = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.source = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MeetingsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String title,
    this.description = const Value.absent(),
    required DateTime startAt,
    this.durationMin = const Value.absent(),
    this.allDay = const Value.absent(),
    this.lockTimezone = const Value.absent(),
    this.authoredTimezone = const Value.absent(),
    this.locationJson = const Value.absent(),
    this.prepNotes = const Value.absent(),
    this.prepMinutes = const Value.absent(),
    this.reminderOffsetsJson = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.source = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        title = Value(title),
        startAt = Value(startAt),
        createdAt = Value(createdAt);
  static Insertable<LocalMeeting> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? title,
    Expression<String>? description,
    Expression<DateTime>? startAt,
    Expression<int>? durationMin,
    Expression<bool>? allDay,
    Expression<String>? lockTimezone,
    Expression<String>? authoredTimezone,
    Expression<String>? locationJson,
    Expression<String>? prepNotes,
    Expression<int>? prepMinutes,
    Expression<String>? reminderOffsetsJson,
    Expression<String>? recurrenceJson,
    Expression<String>? status,
    Expression<DateTime>? completedAt,
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
      if (description != null) 'description': description,
      if (startAt != null) 'start_at': startAt,
      if (durationMin != null) 'duration_min': durationMin,
      if (allDay != null) 'all_day': allDay,
      if (lockTimezone != null) 'lock_timezone': lockTimezone,
      if (authoredTimezone != null) 'authored_timezone': authoredTimezone,
      if (locationJson != null) 'location_json': locationJson,
      if (prepNotes != null) 'prep_notes': prepNotes,
      if (prepMinutes != null) 'prep_minutes': prepMinutes,
      if (reminderOffsetsJson != null)
        'reminder_offsets_json': reminderOffsetsJson,
      if (recurrenceJson != null) 'recurrence_json': recurrenceJson,
      if (status != null) 'status': status,
      if (completedAt != null) 'completed_at': completedAt,
      if (source != null) 'source': source,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MeetingsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? title,
      Value<String?>? description,
      Value<DateTime>? startAt,
      Value<int>? durationMin,
      Value<bool>? allDay,
      Value<String?>? lockTimezone,
      Value<String>? authoredTimezone,
      Value<String?>? locationJson,
      Value<String?>? prepNotes,
      Value<int>? prepMinutes,
      Value<String>? reminderOffsetsJson,
      Value<String?>? recurrenceJson,
      Value<String>? status,
      Value<DateTime?>? completedAt,
      Value<String>? source,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return MeetingsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      title: title ?? this.title,
      description: description ?? this.description,
      startAt: startAt ?? this.startAt,
      durationMin: durationMin ?? this.durationMin,
      allDay: allDay ?? this.allDay,
      lockTimezone: lockTimezone ?? this.lockTimezone,
      authoredTimezone: authoredTimezone ?? this.authoredTimezone,
      locationJson: locationJson ?? this.locationJson,
      prepNotes: prepNotes ?? this.prepNotes,
      prepMinutes: prepMinutes ?? this.prepMinutes,
      reminderOffsetsJson: reminderOffsetsJson ?? this.reminderOffsetsJson,
      recurrenceJson: recurrenceJson ?? this.recurrenceJson,
      status: status ?? this.status,
      completedAt: completedAt ?? this.completedAt,
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
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (startAt.present) {
      map['start_at'] = Variable<DateTime>(startAt.value);
    }
    if (durationMin.present) {
      map['duration_min'] = Variable<int>(durationMin.value);
    }
    if (allDay.present) {
      map['all_day'] = Variable<bool>(allDay.value);
    }
    if (lockTimezone.present) {
      map['lock_timezone'] = Variable<String>(lockTimezone.value);
    }
    if (authoredTimezone.present) {
      map['authored_timezone'] = Variable<String>(authoredTimezone.value);
    }
    if (locationJson.present) {
      map['location_json'] = Variable<String>(locationJson.value);
    }
    if (prepNotes.present) {
      map['prep_notes'] = Variable<String>(prepNotes.value);
    }
    if (prepMinutes.present) {
      map['prep_minutes'] = Variable<int>(prepMinutes.value);
    }
    if (reminderOffsetsJson.present) {
      map['reminder_offsets_json'] =
          Variable<String>(reminderOffsetsJson.value);
    }
    if (recurrenceJson.present) {
      map['recurrence_json'] = Variable<String>(recurrenceJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (completedAt.present) {
      map['completed_at'] = Variable<DateTime>(completedAt.value);
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
    return (StringBuffer('MeetingsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('description: $description, ')
          ..write('startAt: $startAt, ')
          ..write('durationMin: $durationMin, ')
          ..write('allDay: $allDay, ')
          ..write('lockTimezone: $lockTimezone, ')
          ..write('authoredTimezone: $authoredTimezone, ')
          ..write('locationJson: $locationJson, ')
          ..write('prepNotes: $prepNotes, ')
          ..write('prepMinutes: $prepMinutes, ')
          ..write('reminderOffsetsJson: $reminderOffsetsJson, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
          ..write('source: $source, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CalendarEventsTable extends CalendarEvents
    with TableInfo<$CalendarEventsTable, LocalCalendarEvent> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CalendarEventsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _startAtMeta =
      const VerificationMeta('startAt');
  @override
  late final GeneratedColumn<DateTime> startAt = GeneratedColumn<DateTime>(
      'start_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _endAtMeta = const VerificationMeta('endAt');
  @override
  late final GeneratedColumn<DateTime> endAt = GeneratedColumn<DateTime>(
      'end_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _allDayMeta = const VerificationMeta('allDay');
  @override
  late final GeneratedColumn<bool> allDay = GeneratedColumn<bool>(
      'all_day', aliasedName, false,
      type: DriftSqlType.bool,
      requiredDuringInsert: false,
      defaultConstraints:
          GeneratedColumn.constraintIsAlways('CHECK ("all_day" IN (0, 1))'),
      defaultValue: const Constant(false));
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<String> color = GeneratedColumn<String>(
      'color', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _recurrenceJsonMeta =
      const VerificationMeta('recurrenceJson');
  @override
  late final GeneratedColumn<String> recurrenceJson = GeneratedColumn<String>(
      'recurrence_json', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _authoredTimezoneMeta =
      const VerificationMeta('authoredTimezone');
  @override
  late final GeneratedColumn<String> authoredTimezone = GeneratedColumn<String>(
      'authored_timezone', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant(''));
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
        startAt,
        endAt,
        allDay,
        color,
        recurrenceJson,
        authoredTimezone,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'calendar_events';
  @override
  VerificationContext validateIntegrity(Insertable<LocalCalendarEvent> instance,
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
    if (data.containsKey('start_at')) {
      context.handle(_startAtMeta,
          startAt.isAcceptableOrUnknown(data['start_at']!, _startAtMeta));
    } else if (isInserting) {
      context.missing(_startAtMeta);
    }
    if (data.containsKey('end_at')) {
      context.handle(
          _endAtMeta, endAt.isAcceptableOrUnknown(data['end_at']!, _endAtMeta));
    } else if (isInserting) {
      context.missing(_endAtMeta);
    }
    if (data.containsKey('all_day')) {
      context.handle(_allDayMeta,
          allDay.isAcceptableOrUnknown(data['all_day']!, _allDayMeta));
    }
    if (data.containsKey('color')) {
      context.handle(
          _colorMeta, color.isAcceptableOrUnknown(data['color']!, _colorMeta));
    }
    if (data.containsKey('recurrence_json')) {
      context.handle(
          _recurrenceJsonMeta,
          recurrenceJson.isAcceptableOrUnknown(
              data['recurrence_json']!, _recurrenceJsonMeta));
    }
    if (data.containsKey('authored_timezone')) {
      context.handle(
          _authoredTimezoneMeta,
          authoredTimezone.isAcceptableOrUnknown(
              data['authored_timezone']!, _authoredTimezoneMeta));
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
  LocalCalendarEvent map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalCalendarEvent(
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
      startAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}start_at'])!,
      endAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}end_at'])!,
      allDay: attachedDatabase.typeMapping
          .read(DriftSqlType.bool, data['${effectivePrefix}all_day'])!,
      color: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}color']),
      recurrenceJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}recurrence_json']),
      authoredTimezone: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}authored_timezone'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $CalendarEventsTable createAlias(String alias) {
    return $CalendarEventsTable(attachedDatabase, alias);
  }
}

class LocalCalendarEvent extends DataClass
    implements Insertable<LocalCalendarEvent> {
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
  final DateTime startAt;

  /// After [startAt], and at most a year later — the server's own bound, and
  /// not tidiness: the expander derives an occurrence's window from the length,
  /// so an unbounded event would appear on every agenda between its two ends.
  final DateTime endAt;
  final bool allDay;

  /// `#rrggbb`, or null for the theme's own. A string and not a palette index,
  /// for the reason [Labels.color] gives.
  final String? color;
  final String? recurrenceJson;

  /// As on [Meetings], and never written here. An event has no `lockTimezone`
  /// at all — a birthday is a date rather than an instant, so pinning it to a
  /// zone would put a member who flew on the wrong day of their own birthday.
  final String authoredTimezone;
  final DateTime createdAt;
  const LocalCalendarEvent(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.title,
      this.notes,
      required this.startAt,
      required this.endAt,
      required this.allDay,
      this.color,
      this.recurrenceJson,
      required this.authoredTimezone,
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
    map['start_at'] = Variable<DateTime>(startAt);
    map['end_at'] = Variable<DateTime>(endAt);
    map['all_day'] = Variable<bool>(allDay);
    if (!nullToAbsent || color != null) {
      map['color'] = Variable<String>(color);
    }
    if (!nullToAbsent || recurrenceJson != null) {
      map['recurrence_json'] = Variable<String>(recurrenceJson);
    }
    map['authored_timezone'] = Variable<String>(authoredTimezone);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  CalendarEventsCompanion toCompanion(bool nullToAbsent) {
    return CalendarEventsCompanion(
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
      startAt: Value(startAt),
      endAt: Value(endAt),
      allDay: Value(allDay),
      color:
          color == null && nullToAbsent ? const Value.absent() : Value(color),
      recurrenceJson: recurrenceJson == null && nullToAbsent
          ? const Value.absent()
          : Value(recurrenceJson),
      authoredTimezone: Value(authoredTimezone),
      createdAt: Value(createdAt),
    );
  }

  factory LocalCalendarEvent.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalCalendarEvent(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      title: serializer.fromJson<String>(json['title']),
      notes: serializer.fromJson<String?>(json['notes']),
      startAt: serializer.fromJson<DateTime>(json['startAt']),
      endAt: serializer.fromJson<DateTime>(json['endAt']),
      allDay: serializer.fromJson<bool>(json['allDay']),
      color: serializer.fromJson<String?>(json['color']),
      recurrenceJson: serializer.fromJson<String?>(json['recurrenceJson']),
      authoredTimezone: serializer.fromJson<String>(json['authoredTimezone']),
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
      'startAt': serializer.toJson<DateTime>(startAt),
      'endAt': serializer.toJson<DateTime>(endAt),
      'allDay': serializer.toJson<bool>(allDay),
      'color': serializer.toJson<String?>(color),
      'recurrenceJson': serializer.toJson<String?>(recurrenceJson),
      'authoredTimezone': serializer.toJson<String>(authoredTimezone),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalCalendarEvent copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? title,
          Value<String?> notes = const Value.absent(),
          DateTime? startAt,
          DateTime? endAt,
          bool? allDay,
          Value<String?> color = const Value.absent(),
          Value<String?> recurrenceJson = const Value.absent(),
          String? authoredTimezone,
          DateTime? createdAt}) =>
      LocalCalendarEvent(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        title: title ?? this.title,
        notes: notes.present ? notes.value : this.notes,
        startAt: startAt ?? this.startAt,
        endAt: endAt ?? this.endAt,
        allDay: allDay ?? this.allDay,
        color: color.present ? color.value : this.color,
        recurrenceJson:
            recurrenceJson.present ? recurrenceJson.value : this.recurrenceJson,
        authoredTimezone: authoredTimezone ?? this.authoredTimezone,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalCalendarEvent copyWithCompanion(CalendarEventsCompanion data) {
    return LocalCalendarEvent(
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
      startAt: data.startAt.present ? data.startAt.value : this.startAt,
      endAt: data.endAt.present ? data.endAt.value : this.endAt,
      allDay: data.allDay.present ? data.allDay.value : this.allDay,
      color: data.color.present ? data.color.value : this.color,
      recurrenceJson: data.recurrenceJson.present
          ? data.recurrenceJson.value
          : this.recurrenceJson,
      authoredTimezone: data.authoredTimezone.present
          ? data.authoredTimezone.value
          : this.authoredTimezone,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalCalendarEvent(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('notes: $notes, ')
          ..write('startAt: $startAt, ')
          ..write('endAt: $endAt, ')
          ..write('allDay: $allDay, ')
          ..write('color: $color, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('authoredTimezone: $authoredTimezone, ')
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
      notes,
      startAt,
      endAt,
      allDay,
      color,
      recurrenceJson,
      authoredTimezone,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalCalendarEvent &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.title == this.title &&
          other.notes == this.notes &&
          other.startAt == this.startAt &&
          other.endAt == this.endAt &&
          other.allDay == this.allDay &&
          other.color == this.color &&
          other.recurrenceJson == this.recurrenceJson &&
          other.authoredTimezone == this.authoredTimezone &&
          other.createdAt == this.createdAt);
}

class CalendarEventsCompanion extends UpdateCompanion<LocalCalendarEvent> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> title;
  final Value<String?> notes;
  final Value<DateTime> startAt;
  final Value<DateTime> endAt;
  final Value<bool> allDay;
  final Value<String?> color;
  final Value<String?> recurrenceJson;
  final Value<String> authoredTimezone;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const CalendarEventsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.title = const Value.absent(),
    this.notes = const Value.absent(),
    this.startAt = const Value.absent(),
    this.endAt = const Value.absent(),
    this.allDay = const Value.absent(),
    this.color = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.authoredTimezone = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CalendarEventsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String title,
    this.notes = const Value.absent(),
    required DateTime startAt,
    required DateTime endAt,
    this.allDay = const Value.absent(),
    this.color = const Value.absent(),
    this.recurrenceJson = const Value.absent(),
    this.authoredTimezone = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        title = Value(title),
        startAt = Value(startAt),
        endAt = Value(endAt),
        createdAt = Value(createdAt);
  static Insertable<LocalCalendarEvent> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? title,
    Expression<String>? notes,
    Expression<DateTime>? startAt,
    Expression<DateTime>? endAt,
    Expression<bool>? allDay,
    Expression<String>? color,
    Expression<String>? recurrenceJson,
    Expression<String>? authoredTimezone,
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
      if (startAt != null) 'start_at': startAt,
      if (endAt != null) 'end_at': endAt,
      if (allDay != null) 'all_day': allDay,
      if (color != null) 'color': color,
      if (recurrenceJson != null) 'recurrence_json': recurrenceJson,
      if (authoredTimezone != null) 'authored_timezone': authoredTimezone,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CalendarEventsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? title,
      Value<String?>? notes,
      Value<DateTime>? startAt,
      Value<DateTime>? endAt,
      Value<bool>? allDay,
      Value<String?>? color,
      Value<String?>? recurrenceJson,
      Value<String>? authoredTimezone,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return CalendarEventsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      title: title ?? this.title,
      notes: notes ?? this.notes,
      startAt: startAt ?? this.startAt,
      endAt: endAt ?? this.endAt,
      allDay: allDay ?? this.allDay,
      color: color ?? this.color,
      recurrenceJson: recurrenceJson ?? this.recurrenceJson,
      authoredTimezone: authoredTimezone ?? this.authoredTimezone,
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
    if (startAt.present) {
      map['start_at'] = Variable<DateTime>(startAt.value);
    }
    if (endAt.present) {
      map['end_at'] = Variable<DateTime>(endAt.value);
    }
    if (allDay.present) {
      map['all_day'] = Variable<bool>(allDay.value);
    }
    if (color.present) {
      map['color'] = Variable<String>(color.value);
    }
    if (recurrenceJson.present) {
      map['recurrence_json'] = Variable<String>(recurrenceJson.value);
    }
    if (authoredTimezone.present) {
      map['authored_timezone'] = Variable<String>(authoredTimezone.value);
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
    return (StringBuffer('CalendarEventsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('notes: $notes, ')
          ..write('startAt: $startAt, ')
          ..write('endAt: $endAt, ')
          ..write('allDay: $allDay, ')
          ..write('color: $color, ')
          ..write('recurrenceJson: $recurrenceJson, ')
          ..write('authoredTimezone: $authoredTimezone, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AthleteProfileTable extends AthleteProfile
    with TableInfo<$AthleteProfileTable, LocalAthleteProfile> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AthleteProfileTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
  @override
  late final GeneratedColumn<String> userId = GeneratedColumn<String>(
      'user_id', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sportsJsonMeta =
      const VerificationMeta('sportsJson');
  @override
  late final GeneratedColumn<String> sportsJson = GeneratedColumn<String>(
      'sports_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _slotsJsonMeta =
      const VerificationMeta('slotsJson');
  @override
  late final GeneratedColumn<String> slotsJson = GeneratedColumn<String>(
      'slots_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
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
  static const VerificationMeta _fetchedAtMeta =
      const VerificationMeta('fetchedAt');
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
      'fetched_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  @override
  List<GeneratedColumn> get $columns =>
      [userId, sportsJson, slotsJson, pendingOp, pushAttempts, fetchedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'athlete_profile';
  @override
  VerificationContext validateIntegrity(
      Insertable<LocalAthleteProfile> instance,
      {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('user_id')) {
      context.handle(_userIdMeta,
          userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));
    } else if (isInserting) {
      context.missing(_userIdMeta);
    }
    if (data.containsKey('sports_json')) {
      context.handle(
          _sportsJsonMeta,
          sportsJson.isAcceptableOrUnknown(
              data['sports_json']!, _sportsJsonMeta));
    }
    if (data.containsKey('slots_json')) {
      context.handle(_slotsJsonMeta,
          slotsJson.isAcceptableOrUnknown(data['slots_json']!, _slotsJsonMeta));
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
  LocalAthleteProfile map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalAthleteProfile(
      userId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}user_id'])!,
      sportsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sports_json'])!,
      slotsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}slots_json'])!,
      pendingOp: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}pending_op']),
      pushAttempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}push_attempts'])!,
      fetchedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}fetched_at'])!,
    );
  }

  @override
  $AthleteProfileTable createAlias(String alias) {
    return $AthleteProfileTable(attachedDatabase, alias);
  }
}

class LocalAthleteProfile extends DataClass
    implements Insertable<LocalAthleteProfile> {
  final String userId;
  final String sportsJson;
  final String slotsJson;

  /// `update`, or null for a row with nothing queued. Only ever `update`: a
  /// patch has no create, no delete and no purge — the server writes the empty
  /// profile when the member registers, which is what lets every reader
  /// promise a document rather than a null.
  final String? pendingOp;
  final int pushAttempts;

  /// When this copy was last filled from the server. As on [Profiles], this is
  /// about the copy and not about the record.
  final DateTime fetchedAt;
  const LocalAthleteProfile(
      {required this.userId,
      required this.sportsJson,
      required this.slotsJson,
      this.pendingOp,
      required this.pushAttempts,
      required this.fetchedAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['user_id'] = Variable<String>(userId);
    map['sports_json'] = Variable<String>(sportsJson);
    map['slots_json'] = Variable<String>(slotsJson);
    if (!nullToAbsent || pendingOp != null) {
      map['pending_op'] = Variable<String>(pendingOp);
    }
    map['push_attempts'] = Variable<int>(pushAttempts);
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  AthleteProfileCompanion toCompanion(bool nullToAbsent) {
    return AthleteProfileCompanion(
      userId: Value(userId),
      sportsJson: Value(sportsJson),
      slotsJson: Value(slotsJson),
      pendingOp: pendingOp == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingOp),
      pushAttempts: Value(pushAttempts),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory LocalAthleteProfile.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalAthleteProfile(
      userId: serializer.fromJson<String>(json['userId']),
      sportsJson: serializer.fromJson<String>(json['sportsJson']),
      slotsJson: serializer.fromJson<String>(json['slotsJson']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'userId': serializer.toJson<String>(userId),
      'sportsJson': serializer.toJson<String>(sportsJson),
      'slotsJson': serializer.toJson<String>(slotsJson),
      'pendingOp': serializer.toJson<String?>(pendingOp),
      'pushAttempts': serializer.toJson<int>(pushAttempts),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  LocalAthleteProfile copyWith(
          {String? userId,
          String? sportsJson,
          String? slotsJson,
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          DateTime? fetchedAt}) =>
      LocalAthleteProfile(
        userId: userId ?? this.userId,
        sportsJson: sportsJson ?? this.sportsJson,
        slotsJson: slotsJson ?? this.slotsJson,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        fetchedAt: fetchedAt ?? this.fetchedAt,
      );
  LocalAthleteProfile copyWithCompanion(AthleteProfileCompanion data) {
    return LocalAthleteProfile(
      userId: data.userId.present ? data.userId.value : this.userId,
      sportsJson:
          data.sportsJson.present ? data.sportsJson.value : this.sportsJson,
      slotsJson: data.slotsJson.present ? data.slotsJson.value : this.slotsJson,
      pendingOp: data.pendingOp.present ? data.pendingOp.value : this.pendingOp,
      pushAttempts: data.pushAttempts.present
          ? data.pushAttempts.value
          : this.pushAttempts,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalAthleteProfile(')
          ..write('userId: $userId, ')
          ..write('sportsJson: $sportsJson, ')
          ..write('slotsJson: $slotsJson, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
      userId, sportsJson, slotsJson, pendingOp, pushAttempts, fetchedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalAthleteProfile &&
          other.userId == this.userId &&
          other.sportsJson == this.sportsJson &&
          other.slotsJson == this.slotsJson &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.fetchedAt == this.fetchedAt);
}

class AthleteProfileCompanion extends UpdateCompanion<LocalAthleteProfile> {
  final Value<String> userId;
  final Value<String> sportsJson;
  final Value<String> slotsJson;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const AthleteProfileCompanion({
    this.userId = const Value.absent(),
    this.sportsJson = const Value.absent(),
    this.slotsJson = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AthleteProfileCompanion.insert({
    required String userId,
    this.sportsJson = const Value.absent(),
    this.slotsJson = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  })  : userId = Value(userId),
        fetchedAt = Value(fetchedAt);
  static Insertable<LocalAthleteProfile> custom({
    Expression<String>? userId,
    Expression<String>? sportsJson,
    Expression<String>? slotsJson,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (userId != null) 'user_id': userId,
      if (sportsJson != null) 'sports_json': sportsJson,
      if (slotsJson != null) 'slots_json': slotsJson,
      if (pendingOp != null) 'pending_op': pendingOp,
      if (pushAttempts != null) 'push_attempts': pushAttempts,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AthleteProfileCompanion copyWith(
      {Value<String>? userId,
      Value<String>? sportsJson,
      Value<String>? slotsJson,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime>? fetchedAt,
      Value<int>? rowid}) {
    return AthleteProfileCompanion(
      userId: userId ?? this.userId,
      sportsJson: sportsJson ?? this.sportsJson,
      slotsJson: slotsJson ?? this.slotsJson,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
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
    if (sportsJson.present) {
      map['sports_json'] = Variable<String>(sportsJson.value);
    }
    if (slotsJson.present) {
      map['slots_json'] = Variable<String>(slotsJson.value);
    }
    if (pendingOp.present) {
      map['pending_op'] = Variable<String>(pendingOp.value);
    }
    if (pushAttempts.present) {
      map['push_attempts'] = Variable<int>(pushAttempts.value);
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
    return (StringBuffer('AthleteProfileCompanion(')
          ..write('userId: $userId, ')
          ..write('sportsJson: $sportsJson, ')
          ..write('slotsJson: $slotsJson, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ProgramsTable extends Programs
    with TableInfo<$ProgramsTable, LocalProgram> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ProgramsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _sportMeta = const VerificationMeta('sport');
  @override
  late final GeneratedColumn<String> sport = GeneratedColumn<String>(
      'sport', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
      'source', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('user'));
  static const VerificationMeta _sourceLinkIdsJsonMeta =
      const VerificationMeta('sourceLinkIdsJson');
  @override
  late final GeneratedColumn<String> sourceLinkIdsJson =
      GeneratedColumn<String>('source_link_ids_json', aliasedName, false,
          type: DriftSqlType.string,
          requiredDuringInsert: false,
          defaultValue: const Constant('[]'));
  static const VerificationMeta _weeksJsonMeta =
      const VerificationMeta('weeksJson');
  @override
  late final GeneratedColumn<String> weeksJson = GeneratedColumn<String>(
      'weeks_json', aliasedName, false,
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
  static const VerificationMeta _appliedStartDateMeta =
      const VerificationMeta('appliedStartDate');
  @override
  late final GeneratedColumn<String> appliedStartDate = GeneratedColumn<String>(
      'applied_start_date', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
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
        sport,
        source,
        sourceLinkIdsJson,
        weeksJson,
        status,
        appliedStartDate,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'programs';
  @override
  VerificationContext validateIntegrity(Insertable<LocalProgram> instance,
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
    if (data.containsKey('sport')) {
      context.handle(
          _sportMeta, sport.isAcceptableOrUnknown(data['sport']!, _sportMeta));
    } else if (isInserting) {
      context.missing(_sportMeta);
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta,
          source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    }
    if (data.containsKey('source_link_ids_json')) {
      context.handle(
          _sourceLinkIdsJsonMeta,
          sourceLinkIdsJson.isAcceptableOrUnknown(
              data['source_link_ids_json']!, _sourceLinkIdsJsonMeta));
    }
    if (data.containsKey('weeks_json')) {
      context.handle(_weeksJsonMeta,
          weeksJson.isAcceptableOrUnknown(data['weeks_json']!, _weeksJsonMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('applied_start_date')) {
      context.handle(
          _appliedStartDateMeta,
          appliedStartDate.isAcceptableOrUnknown(
              data['applied_start_date']!, _appliedStartDateMeta));
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
  LocalProgram map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalProgram(
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
      sport: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sport'])!,
      source: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}source'])!,
      sourceLinkIdsJson: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}source_link_ids_json'])!,
      weeksJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}weeks_json'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      appliedStartDate: attachedDatabase.typeMapping.read(
          DriftSqlType.string, data['${effectivePrefix}applied_start_date']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $ProgramsTable createAlias(String alias) {
    return $ProgramsTable(attachedDatabase, alias);
  }
}

class LocalProgram extends DataClass implements Insertable<LocalProgram> {
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
  final String sport;

  /// `user` | `suggestion` | `link`.
  final String source;

  /// The ids only, never the links themselves: Knowledge owns those and does
  /// not exist until P7. A client that wants them asks Knowledge.
  final String sourceLinkIdsJson;
  final String weeksJson;

  /// `active` | `archived`. Archiving stops the program filling anything new
  /// and never rewrites a week the member can already see (FR-008).
  final String status;
  final String? appliedStartDate;
  final DateTime createdAt;
  const LocalProgram(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.title,
      required this.sport,
      required this.source,
      required this.sourceLinkIdsJson,
      required this.weeksJson,
      required this.status,
      this.appliedStartDate,
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
    map['sport'] = Variable<String>(sport);
    map['source'] = Variable<String>(source);
    map['source_link_ids_json'] = Variable<String>(sourceLinkIdsJson);
    map['weeks_json'] = Variable<String>(weeksJson);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || appliedStartDate != null) {
      map['applied_start_date'] = Variable<String>(appliedStartDate);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  ProgramsCompanion toCompanion(bool nullToAbsent) {
    return ProgramsCompanion(
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
      sport: Value(sport),
      source: Value(source),
      sourceLinkIdsJson: Value(sourceLinkIdsJson),
      weeksJson: Value(weeksJson),
      status: Value(status),
      appliedStartDate: appliedStartDate == null && nullToAbsent
          ? const Value.absent()
          : Value(appliedStartDate),
      createdAt: Value(createdAt),
    );
  }

  factory LocalProgram.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalProgram(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      title: serializer.fromJson<String>(json['title']),
      sport: serializer.fromJson<String>(json['sport']),
      source: serializer.fromJson<String>(json['source']),
      sourceLinkIdsJson: serializer.fromJson<String>(json['sourceLinkIdsJson']),
      weeksJson: serializer.fromJson<String>(json['weeksJson']),
      status: serializer.fromJson<String>(json['status']),
      appliedStartDate: serializer.fromJson<String?>(json['appliedStartDate']),
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
      'sport': serializer.toJson<String>(sport),
      'source': serializer.toJson<String>(source),
      'sourceLinkIdsJson': serializer.toJson<String>(sourceLinkIdsJson),
      'weeksJson': serializer.toJson<String>(weeksJson),
      'status': serializer.toJson<String>(status),
      'appliedStartDate': serializer.toJson<String?>(appliedStartDate),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalProgram copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? title,
          String? sport,
          String? source,
          String? sourceLinkIdsJson,
          String? weeksJson,
          String? status,
          Value<String?> appliedStartDate = const Value.absent(),
          DateTime? createdAt}) =>
      LocalProgram(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        title: title ?? this.title,
        sport: sport ?? this.sport,
        source: source ?? this.source,
        sourceLinkIdsJson: sourceLinkIdsJson ?? this.sourceLinkIdsJson,
        weeksJson: weeksJson ?? this.weeksJson,
        status: status ?? this.status,
        appliedStartDate: appliedStartDate.present
            ? appliedStartDate.value
            : this.appliedStartDate,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalProgram copyWithCompanion(ProgramsCompanion data) {
    return LocalProgram(
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
      sport: data.sport.present ? data.sport.value : this.sport,
      source: data.source.present ? data.source.value : this.source,
      sourceLinkIdsJson: data.sourceLinkIdsJson.present
          ? data.sourceLinkIdsJson.value
          : this.sourceLinkIdsJson,
      weeksJson: data.weeksJson.present ? data.weeksJson.value : this.weeksJson,
      status: data.status.present ? data.status.value : this.status,
      appliedStartDate: data.appliedStartDate.present
          ? data.appliedStartDate.value
          : this.appliedStartDate,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalProgram(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('sport: $sport, ')
          ..write('source: $source, ')
          ..write('sourceLinkIdsJson: $sourceLinkIdsJson, ')
          ..write('weeksJson: $weeksJson, ')
          ..write('status: $status, ')
          ..write('appliedStartDate: $appliedStartDate, ')
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
      sport,
      source,
      sourceLinkIdsJson,
      weeksJson,
      status,
      appliedStartDate,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalProgram &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.title == this.title &&
          other.sport == this.sport &&
          other.source == this.source &&
          other.sourceLinkIdsJson == this.sourceLinkIdsJson &&
          other.weeksJson == this.weeksJson &&
          other.status == this.status &&
          other.appliedStartDate == this.appliedStartDate &&
          other.createdAt == this.createdAt);
}

class ProgramsCompanion extends UpdateCompanion<LocalProgram> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> title;
  final Value<String> sport;
  final Value<String> source;
  final Value<String> sourceLinkIdsJson;
  final Value<String> weeksJson;
  final Value<String> status;
  final Value<String?> appliedStartDate;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const ProgramsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.title = const Value.absent(),
    this.sport = const Value.absent(),
    this.source = const Value.absent(),
    this.sourceLinkIdsJson = const Value.absent(),
    this.weeksJson = const Value.absent(),
    this.status = const Value.absent(),
    this.appliedStartDate = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ProgramsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String title,
    required String sport,
    this.source = const Value.absent(),
    this.sourceLinkIdsJson = const Value.absent(),
    this.weeksJson = const Value.absent(),
    this.status = const Value.absent(),
    this.appliedStartDate = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        title = Value(title),
        sport = Value(sport),
        createdAt = Value(createdAt);
  static Insertable<LocalProgram> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? title,
    Expression<String>? sport,
    Expression<String>? source,
    Expression<String>? sourceLinkIdsJson,
    Expression<String>? weeksJson,
    Expression<String>? status,
    Expression<String>? appliedStartDate,
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
      if (sport != null) 'sport': sport,
      if (source != null) 'source': source,
      if (sourceLinkIdsJson != null) 'source_link_ids_json': sourceLinkIdsJson,
      if (weeksJson != null) 'weeks_json': weeksJson,
      if (status != null) 'status': status,
      if (appliedStartDate != null) 'applied_start_date': appliedStartDate,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ProgramsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? title,
      Value<String>? sport,
      Value<String>? source,
      Value<String>? sourceLinkIdsJson,
      Value<String>? weeksJson,
      Value<String>? status,
      Value<String?>? appliedStartDate,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return ProgramsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      title: title ?? this.title,
      sport: sport ?? this.sport,
      source: source ?? this.source,
      sourceLinkIdsJson: sourceLinkIdsJson ?? this.sourceLinkIdsJson,
      weeksJson: weeksJson ?? this.weeksJson,
      status: status ?? this.status,
      appliedStartDate: appliedStartDate ?? this.appliedStartDate,
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
    if (sport.present) {
      map['sport'] = Variable<String>(sport.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (sourceLinkIdsJson.present) {
      map['source_link_ids_json'] = Variable<String>(sourceLinkIdsJson.value);
    }
    if (weeksJson.present) {
      map['weeks_json'] = Variable<String>(weeksJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (appliedStartDate.present) {
      map['applied_start_date'] = Variable<String>(appliedStartDate.value);
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
    return (StringBuffer('ProgramsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('title: $title, ')
          ..write('sport: $sport, ')
          ..write('source: $source, ')
          ..write('sourceLinkIdsJson: $sourceLinkIdsJson, ')
          ..write('weeksJson: $weeksJson, ')
          ..write('status: $status, ')
          ..write('appliedStartDate: $appliedStartDate, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $WorkoutsTable extends Workouts
    with TableInfo<$WorkoutsTable, LocalWorkout> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WorkoutsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _sportMeta = const VerificationMeta('sport');
  @override
  late final GeneratedColumn<String> sport = GeneratedColumn<String>(
      'sport', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _exercisesJsonMeta =
      const VerificationMeta('exercisesJson');
  @override
  late final GeneratedColumn<String> exercisesJson = GeneratedColumn<String>(
      'exercises_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _tagsJsonMeta =
      const VerificationMeta('tagsJson');
  @override
  late final GeneratedColumn<String> tagsJson = GeneratedColumn<String>(
      'tags_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
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
        sport,
        exercisesJson,
        tagsJson,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'workouts';
  @override
  VerificationContext validateIntegrity(Insertable<LocalWorkout> instance,
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
    if (data.containsKey('sport')) {
      context.handle(
          _sportMeta, sport.isAcceptableOrUnknown(data['sport']!, _sportMeta));
    } else if (isInserting) {
      context.missing(_sportMeta);
    }
    if (data.containsKey('exercises_json')) {
      context.handle(
          _exercisesJsonMeta,
          exercisesJson.isAcceptableOrUnknown(
              data['exercises_json']!, _exercisesJsonMeta));
    }
    if (data.containsKey('tags_json')) {
      context.handle(_tagsJsonMeta,
          tagsJson.isAcceptableOrUnknown(data['tags_json']!, _tagsJsonMeta));
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
  LocalWorkout map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalWorkout(
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
      sport: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sport'])!,
      exercisesJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}exercises_json'])!,
      tagsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tags_json'])!,
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $WorkoutsTable createAlias(String alias) {
    return $WorkoutsTable(attachedDatabase, alias);
  }
}

class LocalWorkout extends DataClass implements Insertable<LocalWorkout> {
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
  final String sport;
  final String exercisesJson;
  final String tagsJson;
  final DateTime createdAt;
  const LocalWorkout(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.name,
      required this.sport,
      required this.exercisesJson,
      required this.tagsJson,
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
    map['sport'] = Variable<String>(sport);
    map['exercises_json'] = Variable<String>(exercisesJson);
    map['tags_json'] = Variable<String>(tagsJson);
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  WorkoutsCompanion toCompanion(bool nullToAbsent) {
    return WorkoutsCompanion(
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
      sport: Value(sport),
      exercisesJson: Value(exercisesJson),
      tagsJson: Value(tagsJson),
      createdAt: Value(createdAt),
    );
  }

  factory LocalWorkout.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalWorkout(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      name: serializer.fromJson<String>(json['name']),
      sport: serializer.fromJson<String>(json['sport']),
      exercisesJson: serializer.fromJson<String>(json['exercisesJson']),
      tagsJson: serializer.fromJson<String>(json['tagsJson']),
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
      'sport': serializer.toJson<String>(sport),
      'exercisesJson': serializer.toJson<String>(exercisesJson),
      'tagsJson': serializer.toJson<String>(tagsJson),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalWorkout copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? name,
          String? sport,
          String? exercisesJson,
          String? tagsJson,
          DateTime? createdAt}) =>
      LocalWorkout(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        name: name ?? this.name,
        sport: sport ?? this.sport,
        exercisesJson: exercisesJson ?? this.exercisesJson,
        tagsJson: tagsJson ?? this.tagsJson,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalWorkout copyWithCompanion(WorkoutsCompanion data) {
    return LocalWorkout(
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
      sport: data.sport.present ? data.sport.value : this.sport,
      exercisesJson: data.exercisesJson.present
          ? data.exercisesJson.value
          : this.exercisesJson,
      tagsJson: data.tagsJson.present ? data.tagsJson.value : this.tagsJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalWorkout(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('name: $name, ')
          ..write('sport: $sport, ')
          ..write('exercisesJson: $exercisesJson, ')
          ..write('tagsJson: $tagsJson, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, updatedAt, baseUpdatedAt, pendingOp,
      pushAttempts, deletedAt, name, sport, exercisesJson, tagsJson, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalWorkout &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.name == this.name &&
          other.sport == this.sport &&
          other.exercisesJson == this.exercisesJson &&
          other.tagsJson == this.tagsJson &&
          other.createdAt == this.createdAt);
}

class WorkoutsCompanion extends UpdateCompanion<LocalWorkout> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> name;
  final Value<String> sport;
  final Value<String> exercisesJson;
  final Value<String> tagsJson;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const WorkoutsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.name = const Value.absent(),
    this.sport = const Value.absent(),
    this.exercisesJson = const Value.absent(),
    this.tagsJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  WorkoutsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String name,
    required String sport,
    this.exercisesJson = const Value.absent(),
    this.tagsJson = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        name = Value(name),
        sport = Value(sport),
        createdAt = Value(createdAt);
  static Insertable<LocalWorkout> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? name,
    Expression<String>? sport,
    Expression<String>? exercisesJson,
    Expression<String>? tagsJson,
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
      if (sport != null) 'sport': sport,
      if (exercisesJson != null) 'exercises_json': exercisesJson,
      if (tagsJson != null) 'tags_json': tagsJson,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  WorkoutsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? name,
      Value<String>? sport,
      Value<String>? exercisesJson,
      Value<String>? tagsJson,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return WorkoutsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      name: name ?? this.name,
      sport: sport ?? this.sport,
      exercisesJson: exercisesJson ?? this.exercisesJson,
      tagsJson: tagsJson ?? this.tagsJson,
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
    if (sport.present) {
      map['sport'] = Variable<String>(sport.value);
    }
    if (exercisesJson.present) {
      map['exercises_json'] = Variable<String>(exercisesJson.value);
    }
    if (tagsJson.present) {
      map['tags_json'] = Variable<String>(tagsJson.value);
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
    return (StringBuffer('WorkoutsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('name: $name, ')
          ..write('sport: $sport, ')
          ..write('exercisesJson: $exercisesJson, ')
          ..write('tagsJson: $tagsJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SessionsTable extends Sessions
    with TableInfo<$SessionsTable, LocalSession> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SessionsTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _plannedAtMeta =
      const VerificationMeta('plannedAt');
  @override
  late final GeneratedColumn<DateTime> plannedAt = GeneratedColumn<DateTime>(
      'planned_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _durationMinMeta =
      const VerificationMeta('durationMin');
  @override
  late final GeneratedColumn<int> durationMin = GeneratedColumn<int>(
      'duration_min', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(60));
  static const VerificationMeta _sportMeta = const VerificationMeta('sport');
  @override
  late final GeneratedColumn<String> sport = GeneratedColumn<String>(
      'sport', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _focusMeta = const VerificationMeta('focus');
  @override
  late final GeneratedColumn<String> focus = GeneratedColumn<String>(
      'focus', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _programIdMeta =
      const VerificationMeta('programId');
  @override
  late final GeneratedColumn<String> programId = GeneratedColumn<String>(
      'program_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _weekIndexMeta =
      const VerificationMeta('weekIndex');
  @override
  late final GeneratedColumn<int> weekIndex = GeneratedColumn<int>(
      'week_index', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _slotIdMeta = const VerificationMeta('slotId');
  @override
  late final GeneratedColumn<String> slotId = GeneratedColumn<String>(
      'slot_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _suggestionIdMeta =
      const VerificationMeta('suggestionId');
  @override
  late final GeneratedColumn<String> suggestionId = GeneratedColumn<String>(
      'suggestion_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _exercisesJsonMeta =
      const VerificationMeta('exercisesJson');
  @override
  late final GeneratedColumn<String> exercisesJson = GeneratedColumn<String>(
      'exercises_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('planned'));
  static const VerificationMeta _completedAtMeta =
      const VerificationMeta('completedAt');
  @override
  late final GeneratedColumn<DateTime> completedAt = GeneratedColumn<DateTime>(
      'completed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
  static const VerificationMeta _notesMeta = const VerificationMeta('notes');
  @override
  late final GeneratedColumn<String> notes = GeneratedColumn<String>(
      'notes', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
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
        plannedAt,
        durationMin,
        sport,
        title,
        focus,
        programId,
        weekIndex,
        slotId,
        suggestionId,
        exercisesJson,
        status,
        completedAt,
        notes,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sessions';
  @override
  VerificationContext validateIntegrity(Insertable<LocalSession> instance,
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
    if (data.containsKey('planned_at')) {
      context.handle(_plannedAtMeta,
          plannedAt.isAcceptableOrUnknown(data['planned_at']!, _plannedAtMeta));
    } else if (isInserting) {
      context.missing(_plannedAtMeta);
    }
    if (data.containsKey('duration_min')) {
      context.handle(
          _durationMinMeta,
          durationMin.isAcceptableOrUnknown(
              data['duration_min']!, _durationMinMeta));
    }
    if (data.containsKey('sport')) {
      context.handle(
          _sportMeta, sport.isAcceptableOrUnknown(data['sport']!, _sportMeta));
    } else if (isInserting) {
      context.missing(_sportMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('focus')) {
      context.handle(
          _focusMeta, focus.isAcceptableOrUnknown(data['focus']!, _focusMeta));
    }
    if (data.containsKey('program_id')) {
      context.handle(_programIdMeta,
          programId.isAcceptableOrUnknown(data['program_id']!, _programIdMeta));
    }
    if (data.containsKey('week_index')) {
      context.handle(_weekIndexMeta,
          weekIndex.isAcceptableOrUnknown(data['week_index']!, _weekIndexMeta));
    }
    if (data.containsKey('slot_id')) {
      context.handle(_slotIdMeta,
          slotId.isAcceptableOrUnknown(data['slot_id']!, _slotIdMeta));
    }
    if (data.containsKey('suggestion_id')) {
      context.handle(
          _suggestionIdMeta,
          suggestionId.isAcceptableOrUnknown(
              data['suggestion_id']!, _suggestionIdMeta));
    }
    if (data.containsKey('exercises_json')) {
      context.handle(
          _exercisesJsonMeta,
          exercisesJson.isAcceptableOrUnknown(
              data['exercises_json']!, _exercisesJsonMeta));
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
    if (data.containsKey('notes')) {
      context.handle(
          _notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));
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
  LocalSession map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalSession(
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
      plannedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}planned_at'])!,
      durationMin: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}duration_min'])!,
      sport: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}sport'])!,
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title'])!,
      focus: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}focus']),
      programId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}program_id']),
      weekIndex: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}week_index']),
      slotId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}slot_id']),
      suggestionId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}suggestion_id']),
      exercisesJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}exercises_json'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      completedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}completed_at']),
      notes: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}notes']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $SessionsTable createAlias(String alias) {
    return $SessionsTable(attachedDatabase, alias);
  }
}

class LocalSession extends DataClass implements Insertable<LocalSession> {
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
  final DateTime plannedAt;
  final int durationMin;

  /// One of the seven known names or the member's own word. A text column and
  /// not an enum, for the reason [Conversations.kind] gives — and here it is
  /// the product rule as well: "other" in the picker is a text field, not a
  /// bucket, so a member whose sport is padel stores `padel`.
  final String sport;
  final String title;
  final String? focus;

  /// Which program filled this, and which of its weeks. Null for a bare slot.
  final String? programId;
  final int? weekIndex;

  /// Which weekly slot produced it. Null for a session made by hand.
  final String? slotId;
  final String? suggestionId;
  final String exercisesJson;

  /// `planned` | `completed` | `cancelled` | `skipped`. Four, and a delete
  /// never touches it: a skipped session stays in the week marked skipped,
  /// which is the whole of FR-005's honesty.
  final String status;
  final DateTime? completedAt;
  final String? notes;
  final DateTime createdAt;
  const LocalSession(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.plannedAt,
      required this.durationMin,
      required this.sport,
      required this.title,
      this.focus,
      this.programId,
      this.weekIndex,
      this.slotId,
      this.suggestionId,
      required this.exercisesJson,
      required this.status,
      this.completedAt,
      this.notes,
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
    map['planned_at'] = Variable<DateTime>(plannedAt);
    map['duration_min'] = Variable<int>(durationMin);
    map['sport'] = Variable<String>(sport);
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || focus != null) {
      map['focus'] = Variable<String>(focus);
    }
    if (!nullToAbsent || programId != null) {
      map['program_id'] = Variable<String>(programId);
    }
    if (!nullToAbsent || weekIndex != null) {
      map['week_index'] = Variable<int>(weekIndex);
    }
    if (!nullToAbsent || slotId != null) {
      map['slot_id'] = Variable<String>(slotId);
    }
    if (!nullToAbsent || suggestionId != null) {
      map['suggestion_id'] = Variable<String>(suggestionId);
    }
    map['exercises_json'] = Variable<String>(exercisesJson);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || completedAt != null) {
      map['completed_at'] = Variable<DateTime>(completedAt);
    }
    if (!nullToAbsent || notes != null) {
      map['notes'] = Variable<String>(notes);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  SessionsCompanion toCompanion(bool nullToAbsent) {
    return SessionsCompanion(
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
      plannedAt: Value(plannedAt),
      durationMin: Value(durationMin),
      sport: Value(sport),
      title: Value(title),
      focus:
          focus == null && nullToAbsent ? const Value.absent() : Value(focus),
      programId: programId == null && nullToAbsent
          ? const Value.absent()
          : Value(programId),
      weekIndex: weekIndex == null && nullToAbsent
          ? const Value.absent()
          : Value(weekIndex),
      slotId:
          slotId == null && nullToAbsent ? const Value.absent() : Value(slotId),
      suggestionId: suggestionId == null && nullToAbsent
          ? const Value.absent()
          : Value(suggestionId),
      exercisesJson: Value(exercisesJson),
      status: Value(status),
      completedAt: completedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(completedAt),
      notes:
          notes == null && nullToAbsent ? const Value.absent() : Value(notes),
      createdAt: Value(createdAt),
    );
  }

  factory LocalSession.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalSession(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      plannedAt: serializer.fromJson<DateTime>(json['plannedAt']),
      durationMin: serializer.fromJson<int>(json['durationMin']),
      sport: serializer.fromJson<String>(json['sport']),
      title: serializer.fromJson<String>(json['title']),
      focus: serializer.fromJson<String?>(json['focus']),
      programId: serializer.fromJson<String?>(json['programId']),
      weekIndex: serializer.fromJson<int?>(json['weekIndex']),
      slotId: serializer.fromJson<String?>(json['slotId']),
      suggestionId: serializer.fromJson<String?>(json['suggestionId']),
      exercisesJson: serializer.fromJson<String>(json['exercisesJson']),
      status: serializer.fromJson<String>(json['status']),
      completedAt: serializer.fromJson<DateTime?>(json['completedAt']),
      notes: serializer.fromJson<String?>(json['notes']),
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
      'plannedAt': serializer.toJson<DateTime>(plannedAt),
      'durationMin': serializer.toJson<int>(durationMin),
      'sport': serializer.toJson<String>(sport),
      'title': serializer.toJson<String>(title),
      'focus': serializer.toJson<String?>(focus),
      'programId': serializer.toJson<String?>(programId),
      'weekIndex': serializer.toJson<int?>(weekIndex),
      'slotId': serializer.toJson<String?>(slotId),
      'suggestionId': serializer.toJson<String?>(suggestionId),
      'exercisesJson': serializer.toJson<String>(exercisesJson),
      'status': serializer.toJson<String>(status),
      'completedAt': serializer.toJson<DateTime?>(completedAt),
      'notes': serializer.toJson<String?>(notes),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalSession copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          DateTime? plannedAt,
          int? durationMin,
          String? sport,
          String? title,
          Value<String?> focus = const Value.absent(),
          Value<String?> programId = const Value.absent(),
          Value<int?> weekIndex = const Value.absent(),
          Value<String?> slotId = const Value.absent(),
          Value<String?> suggestionId = const Value.absent(),
          String? exercisesJson,
          String? status,
          Value<DateTime?> completedAt = const Value.absent(),
          Value<String?> notes = const Value.absent(),
          DateTime? createdAt}) =>
      LocalSession(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        plannedAt: plannedAt ?? this.plannedAt,
        durationMin: durationMin ?? this.durationMin,
        sport: sport ?? this.sport,
        title: title ?? this.title,
        focus: focus.present ? focus.value : this.focus,
        programId: programId.present ? programId.value : this.programId,
        weekIndex: weekIndex.present ? weekIndex.value : this.weekIndex,
        slotId: slotId.present ? slotId.value : this.slotId,
        suggestionId:
            suggestionId.present ? suggestionId.value : this.suggestionId,
        exercisesJson: exercisesJson ?? this.exercisesJson,
        status: status ?? this.status,
        completedAt: completedAt.present ? completedAt.value : this.completedAt,
        notes: notes.present ? notes.value : this.notes,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalSession copyWithCompanion(SessionsCompanion data) {
    return LocalSession(
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
      plannedAt: data.plannedAt.present ? data.plannedAt.value : this.plannedAt,
      durationMin:
          data.durationMin.present ? data.durationMin.value : this.durationMin,
      sport: data.sport.present ? data.sport.value : this.sport,
      title: data.title.present ? data.title.value : this.title,
      focus: data.focus.present ? data.focus.value : this.focus,
      programId: data.programId.present ? data.programId.value : this.programId,
      weekIndex: data.weekIndex.present ? data.weekIndex.value : this.weekIndex,
      slotId: data.slotId.present ? data.slotId.value : this.slotId,
      suggestionId: data.suggestionId.present
          ? data.suggestionId.value
          : this.suggestionId,
      exercisesJson: data.exercisesJson.present
          ? data.exercisesJson.value
          : this.exercisesJson,
      status: data.status.present ? data.status.value : this.status,
      completedAt:
          data.completedAt.present ? data.completedAt.value : this.completedAt,
      notes: data.notes.present ? data.notes.value : this.notes,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalSession(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('plannedAt: $plannedAt, ')
          ..write('durationMin: $durationMin, ')
          ..write('sport: $sport, ')
          ..write('title: $title, ')
          ..write('focus: $focus, ')
          ..write('programId: $programId, ')
          ..write('weekIndex: $weekIndex, ')
          ..write('slotId: $slotId, ')
          ..write('suggestionId: $suggestionId, ')
          ..write('exercisesJson: $exercisesJson, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
          ..write('notes: $notes, ')
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
      plannedAt,
      durationMin,
      sport,
      title,
      focus,
      programId,
      weekIndex,
      slotId,
      suggestionId,
      exercisesJson,
      status,
      completedAt,
      notes,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalSession &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.plannedAt == this.plannedAt &&
          other.durationMin == this.durationMin &&
          other.sport == this.sport &&
          other.title == this.title &&
          other.focus == this.focus &&
          other.programId == this.programId &&
          other.weekIndex == this.weekIndex &&
          other.slotId == this.slotId &&
          other.suggestionId == this.suggestionId &&
          other.exercisesJson == this.exercisesJson &&
          other.status == this.status &&
          other.completedAt == this.completedAt &&
          other.notes == this.notes &&
          other.createdAt == this.createdAt);
}

class SessionsCompanion extends UpdateCompanion<LocalSession> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<DateTime> plannedAt;
  final Value<int> durationMin;
  final Value<String> sport;
  final Value<String> title;
  final Value<String?> focus;
  final Value<String?> programId;
  final Value<int?> weekIndex;
  final Value<String?> slotId;
  final Value<String?> suggestionId;
  final Value<String> exercisesJson;
  final Value<String> status;
  final Value<DateTime?> completedAt;
  final Value<String?> notes;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const SessionsCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.plannedAt = const Value.absent(),
    this.durationMin = const Value.absent(),
    this.sport = const Value.absent(),
    this.title = const Value.absent(),
    this.focus = const Value.absent(),
    this.programId = const Value.absent(),
    this.weekIndex = const Value.absent(),
    this.slotId = const Value.absent(),
    this.suggestionId = const Value.absent(),
    this.exercisesJson = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.notes = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SessionsCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required DateTime plannedAt,
    this.durationMin = const Value.absent(),
    required String sport,
    required String title,
    this.focus = const Value.absent(),
    this.programId = const Value.absent(),
    this.weekIndex = const Value.absent(),
    this.slotId = const Value.absent(),
    this.suggestionId = const Value.absent(),
    this.exercisesJson = const Value.absent(),
    this.status = const Value.absent(),
    this.completedAt = const Value.absent(),
    this.notes = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        plannedAt = Value(plannedAt),
        sport = Value(sport),
        title = Value(title),
        createdAt = Value(createdAt);
  static Insertable<LocalSession> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<DateTime>? plannedAt,
    Expression<int>? durationMin,
    Expression<String>? sport,
    Expression<String>? title,
    Expression<String>? focus,
    Expression<String>? programId,
    Expression<int>? weekIndex,
    Expression<String>? slotId,
    Expression<String>? suggestionId,
    Expression<String>? exercisesJson,
    Expression<String>? status,
    Expression<DateTime>? completedAt,
    Expression<String>? notes,
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
      if (plannedAt != null) 'planned_at': plannedAt,
      if (durationMin != null) 'duration_min': durationMin,
      if (sport != null) 'sport': sport,
      if (title != null) 'title': title,
      if (focus != null) 'focus': focus,
      if (programId != null) 'program_id': programId,
      if (weekIndex != null) 'week_index': weekIndex,
      if (slotId != null) 'slot_id': slotId,
      if (suggestionId != null) 'suggestion_id': suggestionId,
      if (exercisesJson != null) 'exercises_json': exercisesJson,
      if (status != null) 'status': status,
      if (completedAt != null) 'completed_at': completedAt,
      if (notes != null) 'notes': notes,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SessionsCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<DateTime>? plannedAt,
      Value<int>? durationMin,
      Value<String>? sport,
      Value<String>? title,
      Value<String?>? focus,
      Value<String?>? programId,
      Value<int?>? weekIndex,
      Value<String?>? slotId,
      Value<String?>? suggestionId,
      Value<String>? exercisesJson,
      Value<String>? status,
      Value<DateTime?>? completedAt,
      Value<String?>? notes,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return SessionsCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      plannedAt: plannedAt ?? this.plannedAt,
      durationMin: durationMin ?? this.durationMin,
      sport: sport ?? this.sport,
      title: title ?? this.title,
      focus: focus ?? this.focus,
      programId: programId ?? this.programId,
      weekIndex: weekIndex ?? this.weekIndex,
      slotId: slotId ?? this.slotId,
      suggestionId: suggestionId ?? this.suggestionId,
      exercisesJson: exercisesJson ?? this.exercisesJson,
      status: status ?? this.status,
      completedAt: completedAt ?? this.completedAt,
      notes: notes ?? this.notes,
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
    if (plannedAt.present) {
      map['planned_at'] = Variable<DateTime>(plannedAt.value);
    }
    if (durationMin.present) {
      map['duration_min'] = Variable<int>(durationMin.value);
    }
    if (sport.present) {
      map['sport'] = Variable<String>(sport.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (focus.present) {
      map['focus'] = Variable<String>(focus.value);
    }
    if (programId.present) {
      map['program_id'] = Variable<String>(programId.value);
    }
    if (weekIndex.present) {
      map['week_index'] = Variable<int>(weekIndex.value);
    }
    if (slotId.present) {
      map['slot_id'] = Variable<String>(slotId.value);
    }
    if (suggestionId.present) {
      map['suggestion_id'] = Variable<String>(suggestionId.value);
    }
    if (exercisesJson.present) {
      map['exercises_json'] = Variable<String>(exercisesJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (completedAt.present) {
      map['completed_at'] = Variable<DateTime>(completedAt.value);
    }
    if (notes.present) {
      map['notes'] = Variable<String>(notes.value);
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
    return (StringBuffer('SessionsCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('plannedAt: $plannedAt, ')
          ..write('durationMin: $durationMin, ')
          ..write('sport: $sport, ')
          ..write('title: $title, ')
          ..write('focus: $focus, ')
          ..write('programId: $programId, ')
          ..write('weekIndex: $weekIndex, ')
          ..write('slotId: $slotId, ')
          ..write('suggestionId: $suggestionId, ')
          ..write('exercisesJson: $exercisesJson, ')
          ..write('status: $status, ')
          ..write('completedAt: $completedAt, ')
          ..write('notes: $notes, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LinksTable extends Links with TableInfo<$LinksTable, LocalLink> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LinksTable(this.attachedDatabase, [this._alias]);
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
  static const VerificationMeta _urlMeta = const VerificationMeta('url');
  @override
  late final GeneratedColumn<String> url = GeneratedColumn<String>(
      'url', aliasedName, false,
      type: DriftSqlType.string, requiredDuringInsert: true);
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
      'kind', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('article'));
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
      'title', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _tagsJsonMeta =
      const VerificationMeta('tagsJson');
  @override
  late final GeneratedColumn<String> tagsJson = GeneratedColumn<String>(
      'tags_json', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('[]'));
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
      'status', aliasedName, false,
      type: DriftSqlType.string,
      requiredDuringInsert: false,
      defaultValue: const Constant('queued'));
  static const VerificationMeta _failReasonMeta =
      const VerificationMeta('failReason');
  @override
  late final GeneratedColumn<String> failReason = GeneratedColumn<String>(
      'fail_reason', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _attemptsMeta =
      const VerificationMeta('attempts');
  @override
  late final GeneratedColumn<int> attempts = GeneratedColumn<int>(
      'attempts', aliasedName, false,
      type: DriftSqlType.int,
      requiredDuringInsert: false,
      defaultValue: const Constant(0));
  static const VerificationMeta _parentLinkIdMeta =
      const VerificationMeta('parentLinkId');
  @override
  late final GeneratedColumn<String> parentLinkId = GeneratedColumn<String>(
      'parent_link_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _skippedCountMeta =
      const VerificationMeta('skippedCount');
  @override
  late final GeneratedColumn<int> skippedCount = GeneratedColumn<int>(
      'skipped_count', aliasedName, true,
      type: DriftSqlType.int, requiredDuringInsert: false);
  static const VerificationMeta _docIdMeta = const VerificationMeta('docId');
  @override
  late final GeneratedColumn<String> docId = GeneratedColumn<String>(
      'doc_id', aliasedName, true,
      type: DriftSqlType.string, requiredDuringInsert: false);
  static const VerificationMeta _addedAtMeta =
      const VerificationMeta('addedAt');
  @override
  late final GeneratedColumn<DateTime> addedAt = GeneratedColumn<DateTime>(
      'added_at', aliasedName, false,
      type: DriftSqlType.dateTime, requiredDuringInsert: true);
  static const VerificationMeta _processedAtMeta =
      const VerificationMeta('processedAt');
  @override
  late final GeneratedColumn<DateTime> processedAt = GeneratedColumn<DateTime>(
      'processed_at', aliasedName, true,
      type: DriftSqlType.dateTime, requiredDuringInsert: false);
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
        url,
        kind,
        title,
        tagsJson,
        status,
        failReason,
        attempts,
        parentLinkId,
        skippedCount,
        docId,
        addedAt,
        processedAt,
        createdAt
      ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'links';
  @override
  VerificationContext validateIntegrity(Insertable<LocalLink> instance,
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
    if (data.containsKey('url')) {
      context.handle(
          _urlMeta, url.isAcceptableOrUnknown(data['url']!, _urlMeta));
    } else if (isInserting) {
      context.missing(_urlMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
          _kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    }
    if (data.containsKey('title')) {
      context.handle(
          _titleMeta, title.isAcceptableOrUnknown(data['title']!, _titleMeta));
    }
    if (data.containsKey('tags_json')) {
      context.handle(_tagsJsonMeta,
          tagsJson.isAcceptableOrUnknown(data['tags_json']!, _tagsJsonMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta,
          status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('fail_reason')) {
      context.handle(
          _failReasonMeta,
          failReason.isAcceptableOrUnknown(
              data['fail_reason']!, _failReasonMeta));
    }
    if (data.containsKey('attempts')) {
      context.handle(_attemptsMeta,
          attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));
    }
    if (data.containsKey('parent_link_id')) {
      context.handle(
          _parentLinkIdMeta,
          parentLinkId.isAcceptableOrUnknown(
              data['parent_link_id']!, _parentLinkIdMeta));
    }
    if (data.containsKey('skipped_count')) {
      context.handle(
          _skippedCountMeta,
          skippedCount.isAcceptableOrUnknown(
              data['skipped_count']!, _skippedCountMeta));
    }
    if (data.containsKey('doc_id')) {
      context.handle(
          _docIdMeta, docId.isAcceptableOrUnknown(data['doc_id']!, _docIdMeta));
    }
    if (data.containsKey('added_at')) {
      context.handle(_addedAtMeta,
          addedAt.isAcceptableOrUnknown(data['added_at']!, _addedAtMeta));
    } else if (isInserting) {
      context.missing(_addedAtMeta);
    }
    if (data.containsKey('processed_at')) {
      context.handle(
          _processedAtMeta,
          processedAt.isAcceptableOrUnknown(
              data['processed_at']!, _processedAtMeta));
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
  LocalLink map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalLink(
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
      url: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}url'])!,
      kind: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      title: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}title']),
      tagsJson: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}tags_json'])!,
      status: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      failReason: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}fail_reason']),
      attempts: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}attempts'])!,
      parentLinkId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}parent_link_id']),
      skippedCount: attachedDatabase.typeMapping
          .read(DriftSqlType.int, data['${effectivePrefix}skipped_count']),
      docId: attachedDatabase.typeMapping
          .read(DriftSqlType.string, data['${effectivePrefix}doc_id']),
      addedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}added_at'])!,
      processedAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}processed_at']),
      createdAt: attachedDatabase.typeMapping
          .read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $LinksTable createAlias(String alias) {
    return $LinksTable(attachedDatabase, alias);
  }
}

class LocalLink extends DataClass implements Insertable<LocalLink> {
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
  final String url;

  /// `article` | `website` | `video` | `playlist`. The server recognises it
  /// from the URL; the phone never declares one, because a client that could
  /// declare a kind could declare the wrong one.
  final String kind;
  final String? title;
  final String tagsJson;

  /// `queued` | `fetching` | `extracting` | `summarising` | `done` | `failed`.
  ///
  /// The member reads the middle two as one word — "reading" — because from
  /// outside they are one thing. They are two states on the server because a
  /// crash between them says where the work stopped.
  final String status;
  final String? failReason;
  final int attempts;

  /// Set on a playlist's videos; null for anything the member saved directly.
  final String? parentLinkId;

  /// How many of a playlist's videos the Owner's limit left behind. Null — not
  /// zero — for anything that is not an expanded playlist, so the list can say
  /// nothing at all rather than "0 skipped" beside every article.
  final int? skippedCount;

  /// Whether a summary exists to fetch. Never the summary itself.
  final String? docId;
  final DateTime addedAt;
  final DateTime? processedAt;
  final DateTime createdAt;
  const LocalLink(
      {required this.id,
      required this.updatedAt,
      this.baseUpdatedAt,
      this.pendingOp,
      required this.pushAttempts,
      this.deletedAt,
      required this.url,
      required this.kind,
      this.title,
      required this.tagsJson,
      required this.status,
      this.failReason,
      required this.attempts,
      this.parentLinkId,
      this.skippedCount,
      this.docId,
      required this.addedAt,
      this.processedAt,
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
    map['url'] = Variable<String>(url);
    map['kind'] = Variable<String>(kind);
    if (!nullToAbsent || title != null) {
      map['title'] = Variable<String>(title);
    }
    map['tags_json'] = Variable<String>(tagsJson);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || failReason != null) {
      map['fail_reason'] = Variable<String>(failReason);
    }
    map['attempts'] = Variable<int>(attempts);
    if (!nullToAbsent || parentLinkId != null) {
      map['parent_link_id'] = Variable<String>(parentLinkId);
    }
    if (!nullToAbsent || skippedCount != null) {
      map['skipped_count'] = Variable<int>(skippedCount);
    }
    if (!nullToAbsent || docId != null) {
      map['doc_id'] = Variable<String>(docId);
    }
    map['added_at'] = Variable<DateTime>(addedAt);
    if (!nullToAbsent || processedAt != null) {
      map['processed_at'] = Variable<DateTime>(processedAt);
    }
    map['created_at'] = Variable<DateTime>(createdAt);
    return map;
  }

  LinksCompanion toCompanion(bool nullToAbsent) {
    return LinksCompanion(
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
      url: Value(url),
      kind: Value(kind),
      title:
          title == null && nullToAbsent ? const Value.absent() : Value(title),
      tagsJson: Value(tagsJson),
      status: Value(status),
      failReason: failReason == null && nullToAbsent
          ? const Value.absent()
          : Value(failReason),
      attempts: Value(attempts),
      parentLinkId: parentLinkId == null && nullToAbsent
          ? const Value.absent()
          : Value(parentLinkId),
      skippedCount: skippedCount == null && nullToAbsent
          ? const Value.absent()
          : Value(skippedCount),
      docId:
          docId == null && nullToAbsent ? const Value.absent() : Value(docId),
      addedAt: Value(addedAt),
      processedAt: processedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(processedAt),
      createdAt: Value(createdAt),
    );
  }

  factory LocalLink.fromJson(Map<String, dynamic> json,
      {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalLink(
      id: serializer.fromJson<String>(json['id']),
      updatedAt: serializer.fromJson<DateTime>(json['updatedAt']),
      baseUpdatedAt: serializer.fromJson<DateTime?>(json['baseUpdatedAt']),
      pendingOp: serializer.fromJson<String?>(json['pendingOp']),
      pushAttempts: serializer.fromJson<int>(json['pushAttempts']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      url: serializer.fromJson<String>(json['url']),
      kind: serializer.fromJson<String>(json['kind']),
      title: serializer.fromJson<String?>(json['title']),
      tagsJson: serializer.fromJson<String>(json['tagsJson']),
      status: serializer.fromJson<String>(json['status']),
      failReason: serializer.fromJson<String?>(json['failReason']),
      attempts: serializer.fromJson<int>(json['attempts']),
      parentLinkId: serializer.fromJson<String?>(json['parentLinkId']),
      skippedCount: serializer.fromJson<int?>(json['skippedCount']),
      docId: serializer.fromJson<String?>(json['docId']),
      addedAt: serializer.fromJson<DateTime>(json['addedAt']),
      processedAt: serializer.fromJson<DateTime?>(json['processedAt']),
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
      'url': serializer.toJson<String>(url),
      'kind': serializer.toJson<String>(kind),
      'title': serializer.toJson<String?>(title),
      'tagsJson': serializer.toJson<String>(tagsJson),
      'status': serializer.toJson<String>(status),
      'failReason': serializer.toJson<String?>(failReason),
      'attempts': serializer.toJson<int>(attempts),
      'parentLinkId': serializer.toJson<String?>(parentLinkId),
      'skippedCount': serializer.toJson<int?>(skippedCount),
      'docId': serializer.toJson<String?>(docId),
      'addedAt': serializer.toJson<DateTime>(addedAt),
      'processedAt': serializer.toJson<DateTime?>(processedAt),
      'createdAt': serializer.toJson<DateTime>(createdAt),
    };
  }

  LocalLink copyWith(
          {String? id,
          DateTime? updatedAt,
          Value<DateTime?> baseUpdatedAt = const Value.absent(),
          Value<String?> pendingOp = const Value.absent(),
          int? pushAttempts,
          Value<DateTime?> deletedAt = const Value.absent(),
          String? url,
          String? kind,
          Value<String?> title = const Value.absent(),
          String? tagsJson,
          String? status,
          Value<String?> failReason = const Value.absent(),
          int? attempts,
          Value<String?> parentLinkId = const Value.absent(),
          Value<int?> skippedCount = const Value.absent(),
          Value<String?> docId = const Value.absent(),
          DateTime? addedAt,
          Value<DateTime?> processedAt = const Value.absent(),
          DateTime? createdAt}) =>
      LocalLink(
        id: id ?? this.id,
        updatedAt: updatedAt ?? this.updatedAt,
        baseUpdatedAt:
            baseUpdatedAt.present ? baseUpdatedAt.value : this.baseUpdatedAt,
        pendingOp: pendingOp.present ? pendingOp.value : this.pendingOp,
        pushAttempts: pushAttempts ?? this.pushAttempts,
        deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
        url: url ?? this.url,
        kind: kind ?? this.kind,
        title: title.present ? title.value : this.title,
        tagsJson: tagsJson ?? this.tagsJson,
        status: status ?? this.status,
        failReason: failReason.present ? failReason.value : this.failReason,
        attempts: attempts ?? this.attempts,
        parentLinkId:
            parentLinkId.present ? parentLinkId.value : this.parentLinkId,
        skippedCount:
            skippedCount.present ? skippedCount.value : this.skippedCount,
        docId: docId.present ? docId.value : this.docId,
        addedAt: addedAt ?? this.addedAt,
        processedAt: processedAt.present ? processedAt.value : this.processedAt,
        createdAt: createdAt ?? this.createdAt,
      );
  LocalLink copyWithCompanion(LinksCompanion data) {
    return LocalLink(
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
      url: data.url.present ? data.url.value : this.url,
      kind: data.kind.present ? data.kind.value : this.kind,
      title: data.title.present ? data.title.value : this.title,
      tagsJson: data.tagsJson.present ? data.tagsJson.value : this.tagsJson,
      status: data.status.present ? data.status.value : this.status,
      failReason:
          data.failReason.present ? data.failReason.value : this.failReason,
      attempts: data.attempts.present ? data.attempts.value : this.attempts,
      parentLinkId: data.parentLinkId.present
          ? data.parentLinkId.value
          : this.parentLinkId,
      skippedCount: data.skippedCount.present
          ? data.skippedCount.value
          : this.skippedCount,
      docId: data.docId.present ? data.docId.value : this.docId,
      addedAt: data.addedAt.present ? data.addedAt.value : this.addedAt,
      processedAt:
          data.processedAt.present ? data.processedAt.value : this.processedAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalLink(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('url: $url, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('tagsJson: $tagsJson, ')
          ..write('status: $status, ')
          ..write('failReason: $failReason, ')
          ..write('attempts: $attempts, ')
          ..write('parentLinkId: $parentLinkId, ')
          ..write('skippedCount: $skippedCount, ')
          ..write('docId: $docId, ')
          ..write('addedAt: $addedAt, ')
          ..write('processedAt: $processedAt, ')
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
      url,
      kind,
      title,
      tagsJson,
      status,
      failReason,
      attempts,
      parentLinkId,
      skippedCount,
      docId,
      addedAt,
      processedAt,
      createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalLink &&
          other.id == this.id &&
          other.updatedAt == this.updatedAt &&
          other.baseUpdatedAt == this.baseUpdatedAt &&
          other.pendingOp == this.pendingOp &&
          other.pushAttempts == this.pushAttempts &&
          other.deletedAt == this.deletedAt &&
          other.url == this.url &&
          other.kind == this.kind &&
          other.title == this.title &&
          other.tagsJson == this.tagsJson &&
          other.status == this.status &&
          other.failReason == this.failReason &&
          other.attempts == this.attempts &&
          other.parentLinkId == this.parentLinkId &&
          other.skippedCount == this.skippedCount &&
          other.docId == this.docId &&
          other.addedAt == this.addedAt &&
          other.processedAt == this.processedAt &&
          other.createdAt == this.createdAt);
}

class LinksCompanion extends UpdateCompanion<LocalLink> {
  final Value<String> id;
  final Value<DateTime> updatedAt;
  final Value<DateTime?> baseUpdatedAt;
  final Value<String?> pendingOp;
  final Value<int> pushAttempts;
  final Value<DateTime?> deletedAt;
  final Value<String> url;
  final Value<String> kind;
  final Value<String?> title;
  final Value<String> tagsJson;
  final Value<String> status;
  final Value<String?> failReason;
  final Value<int> attempts;
  final Value<String?> parentLinkId;
  final Value<int?> skippedCount;
  final Value<String?> docId;
  final Value<DateTime> addedAt;
  final Value<DateTime?> processedAt;
  final Value<DateTime> createdAt;
  final Value<int> rowid;
  const LinksCompanion({
    this.id = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.url = const Value.absent(),
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.tagsJson = const Value.absent(),
    this.status = const Value.absent(),
    this.failReason = const Value.absent(),
    this.attempts = const Value.absent(),
    this.parentLinkId = const Value.absent(),
    this.skippedCount = const Value.absent(),
    this.docId = const Value.absent(),
    this.addedAt = const Value.absent(),
    this.processedAt = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LinksCompanion.insert({
    required String id,
    required DateTime updatedAt,
    this.baseUpdatedAt = const Value.absent(),
    this.pendingOp = const Value.absent(),
    this.pushAttempts = const Value.absent(),
    this.deletedAt = const Value.absent(),
    required String url,
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.tagsJson = const Value.absent(),
    this.status = const Value.absent(),
    this.failReason = const Value.absent(),
    this.attempts = const Value.absent(),
    this.parentLinkId = const Value.absent(),
    this.skippedCount = const Value.absent(),
    this.docId = const Value.absent(),
    required DateTime addedAt,
    this.processedAt = const Value.absent(),
    required DateTime createdAt,
    this.rowid = const Value.absent(),
  })  : id = Value(id),
        updatedAt = Value(updatedAt),
        url = Value(url),
        addedAt = Value(addedAt),
        createdAt = Value(createdAt);
  static Insertable<LocalLink> custom({
    Expression<String>? id,
    Expression<DateTime>? updatedAt,
    Expression<DateTime>? baseUpdatedAt,
    Expression<String>? pendingOp,
    Expression<int>? pushAttempts,
    Expression<DateTime>? deletedAt,
    Expression<String>? url,
    Expression<String>? kind,
    Expression<String>? title,
    Expression<String>? tagsJson,
    Expression<String>? status,
    Expression<String>? failReason,
    Expression<int>? attempts,
    Expression<String>? parentLinkId,
    Expression<int>? skippedCount,
    Expression<String>? docId,
    Expression<DateTime>? addedAt,
    Expression<DateTime>? processedAt,
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
      if (url != null) 'url': url,
      if (kind != null) 'kind': kind,
      if (title != null) 'title': title,
      if (tagsJson != null) 'tags_json': tagsJson,
      if (status != null) 'status': status,
      if (failReason != null) 'fail_reason': failReason,
      if (attempts != null) 'attempts': attempts,
      if (parentLinkId != null) 'parent_link_id': parentLinkId,
      if (skippedCount != null) 'skipped_count': skippedCount,
      if (docId != null) 'doc_id': docId,
      if (addedAt != null) 'added_at': addedAt,
      if (processedAt != null) 'processed_at': processedAt,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LinksCompanion copyWith(
      {Value<String>? id,
      Value<DateTime>? updatedAt,
      Value<DateTime?>? baseUpdatedAt,
      Value<String?>? pendingOp,
      Value<int>? pushAttempts,
      Value<DateTime?>? deletedAt,
      Value<String>? url,
      Value<String>? kind,
      Value<String?>? title,
      Value<String>? tagsJson,
      Value<String>? status,
      Value<String?>? failReason,
      Value<int>? attempts,
      Value<String?>? parentLinkId,
      Value<int?>? skippedCount,
      Value<String?>? docId,
      Value<DateTime>? addedAt,
      Value<DateTime?>? processedAt,
      Value<DateTime>? createdAt,
      Value<int>? rowid}) {
    return LinksCompanion(
      id: id ?? this.id,
      updatedAt: updatedAt ?? this.updatedAt,
      baseUpdatedAt: baseUpdatedAt ?? this.baseUpdatedAt,
      pendingOp: pendingOp ?? this.pendingOp,
      pushAttempts: pushAttempts ?? this.pushAttempts,
      deletedAt: deletedAt ?? this.deletedAt,
      url: url ?? this.url,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      tagsJson: tagsJson ?? this.tagsJson,
      status: status ?? this.status,
      failReason: failReason ?? this.failReason,
      attempts: attempts ?? this.attempts,
      parentLinkId: parentLinkId ?? this.parentLinkId,
      skippedCount: skippedCount ?? this.skippedCount,
      docId: docId ?? this.docId,
      addedAt: addedAt ?? this.addedAt,
      processedAt: processedAt ?? this.processedAt,
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
    if (url.present) {
      map['url'] = Variable<String>(url.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (tagsJson.present) {
      map['tags_json'] = Variable<String>(tagsJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (failReason.present) {
      map['fail_reason'] = Variable<String>(failReason.value);
    }
    if (attempts.present) {
      map['attempts'] = Variable<int>(attempts.value);
    }
    if (parentLinkId.present) {
      map['parent_link_id'] = Variable<String>(parentLinkId.value);
    }
    if (skippedCount.present) {
      map['skipped_count'] = Variable<int>(skippedCount.value);
    }
    if (docId.present) {
      map['doc_id'] = Variable<String>(docId.value);
    }
    if (addedAt.present) {
      map['added_at'] = Variable<DateTime>(addedAt.value);
    }
    if (processedAt.present) {
      map['processed_at'] = Variable<DateTime>(processedAt.value);
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
    return (StringBuffer('LinksCompanion(')
          ..write('id: $id, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('baseUpdatedAt: $baseUpdatedAt, ')
          ..write('pendingOp: $pendingOp, ')
          ..write('pushAttempts: $pushAttempts, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('url: $url, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('tagsJson: $tagsJson, ')
          ..write('status: $status, ')
          ..write('failReason: $failReason, ')
          ..write('attempts: $attempts, ')
          ..write('parentLinkId: $parentLinkId, ')
          ..write('skippedCount: $skippedCount, ')
          ..write('docId: $docId, ')
          ..write('addedAt: $addedAt, ')
          ..write('processedAt: $processedAt, ')
          ..write('createdAt: $createdAt, ')
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
  late final $DailyPlansTable dailyPlans = $DailyPlansTable(this);
  late final $CheckinsTable checkins = $CheckinsTable(this);
  late final $RhythmStateTable rhythmState = $RhythmStateTable(this);
  late final $ConversationsTable conversations = $ConversationsTable(this);
  late final $MessagesTable messages = $MessagesTable(this);
  late final $PendingMessagesTable pendingMessages =
      $PendingMessagesTable(this);
  late final $MeetingsTable meetings = $MeetingsTable(this);
  late final $CalendarEventsTable calendarEvents = $CalendarEventsTable(this);
  late final $AthleteProfileTable athleteProfile = $AthleteProfileTable(this);
  late final $ProgramsTable programs = $ProgramsTable(this);
  late final $WorkoutsTable workouts = $WorkoutsTable(this);
  late final $SessionsTable sessions = $SessionsTable(this);
  late final $LinksTable links = $LinksTable(this);
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
  late final Index dailyPlansDate = Index('daily_plans_date',
      'CREATE INDEX daily_plans_date ON daily_plans (date)');
  late final Index dailyPlansPending = Index('daily_plans_pending',
      'CREATE INDEX daily_plans_pending ON daily_plans (pending_op)');
  late final Index checkinsDate =
      Index('checkins_date', 'CREATE INDEX checkins_date ON checkins (date)');
  late final Index checkinsPending = Index('checkins_pending',
      'CREATE INDEX checkins_pending ON checkins (pending_op)');
  late final Index conversationsUpdated = Index('conversations_updated',
      'CREATE INDEX conversations_updated ON conversations (updated_at)');
  late final Index conversationsPending = Index('conversations_pending',
      'CREATE INDEX conversations_pending ON conversations (pending_op)');
  late final Index messagesConversationSeq = Index('messages_conversation_seq',
      'CREATE INDEX messages_conversation_seq ON messages (conversation_id, seq)');
  late final Index messagesClient = Index('messages_client',
      'CREATE INDEX messages_client ON messages (client_id)');
  late final Index pendingMessagesComposed = Index('pending_messages_composed',
      'CREATE INDEX pending_messages_composed ON pending_messages (composed_at)');
  late final Index meetingsStart = Index(
      'meetings_start', 'CREATE INDEX meetings_start ON meetings (start_at)');
  late final Index meetingsStatusStart = Index('meetings_status_start',
      'CREATE INDEX meetings_status_start ON meetings (status, start_at)');
  late final Index meetingsPending = Index('meetings_pending',
      'CREATE INDEX meetings_pending ON meetings (pending_op)');
  late final Index calendarEventsStart = Index('calendar_events_start',
      'CREATE INDEX calendar_events_start ON calendar_events (start_at)');
  late final Index calendarEventsPending = Index('calendar_events_pending',
      'CREATE INDEX calendar_events_pending ON calendar_events (pending_op)');
  late final Index programsStatus = Index(
      'programs_status', 'CREATE INDEX programs_status ON programs (status)');
  late final Index programsPending = Index('programs_pending',
      'CREATE INDEX programs_pending ON programs (pending_op)');
  late final Index workoutsSport = Index(
      'workouts_sport', 'CREATE INDEX workouts_sport ON workouts (sport)');
  late final Index workoutsPending = Index('workouts_pending',
      'CREATE INDEX workouts_pending ON workouts (pending_op)');
  late final Index sessionsPlannedAt = Index('sessions_planned_at',
      'CREATE INDEX sessions_planned_at ON sessions (planned_at)');
  late final Index sessionsStatusPlanned = Index('sessions_status_planned',
      'CREATE INDEX sessions_status_planned ON sessions (status, planned_at)');
  late final Index sessionsPending = Index('sessions_pending',
      'CREATE INDEX sessions_pending ON sessions (pending_op)');
  late final Index linksAddedAt = Index(
      'links_added_at', 'CREATE INDEX links_added_at ON links (added_at)');
  late final Index linksStatusAdded = Index('links_status_added',
      'CREATE INDEX links_status_added ON links (status, added_at)');
  late final Index linksParent = Index(
      'links_parent', 'CREATE INDEX links_parent ON links (parent_link_id)');
  late final Index linksPending = Index(
      'links_pending', 'CREATE INDEX links_pending ON links (pending_op)');
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
        dailyPlans,
        checkins,
        rhythmState,
        conversations,
        messages,
        pendingMessages,
        meetings,
        calendarEvents,
        athleteProfile,
        programs,
        workouts,
        sessions,
        links,
        labelsSort,
        labelsPending,
        tasksDue,
        tasksStatusDue,
        tasksLabel,
        tasksPending,
        remindersRemindAt,
        remindersPending,
        alertsLocalNotifyAt,
        dailyPlansDate,
        dailyPlansPending,
        checkinsDate,
        checkinsPending,
        conversationsUpdated,
        conversationsPending,
        messagesConversationSeq,
        messagesClient,
        pendingMessagesComposed,
        meetingsStart,
        meetingsStatusStart,
        meetingsPending,
        calendarEventsStart,
        calendarEventsPending,
        programsStatus,
        programsPending,
        workoutsSport,
        workoutsPending,
        sessionsPlannedAt,
        sessionsStatusPlanned,
        sessionsPending,
        linksAddedAt,
        linksStatusAdded,
        linksParent,
        linksPending
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
typedef $$DailyPlansTableCreateCompanionBuilder = DailyPlansCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String date,
  Value<String> status,
  Value<bool> autoConfirmed,
  Value<String> tasksJson,
  Value<String?> trainingJson,
  Value<String?> workoutLine,
  Value<String?> mealLine,
  Value<DateTime?> promptedAt,
  Value<DateTime?> confirmedAt,
  Value<DateTime?> summarisedAt,
  Value<DateTime?> briefedAt,
  Value<int> rowid,
});
typedef $$DailyPlansTableUpdateCompanionBuilder = DailyPlansCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> date,
  Value<String> status,
  Value<bool> autoConfirmed,
  Value<String> tasksJson,
  Value<String?> trainingJson,
  Value<String?> workoutLine,
  Value<String?> mealLine,
  Value<DateTime?> promptedAt,
  Value<DateTime?> confirmedAt,
  Value<DateTime?> summarisedAt,
  Value<DateTime?> briefedAt,
  Value<int> rowid,
});

class $$DailyPlansTableFilterComposer
    extends Composer<_$AppDatabase, $DailyPlansTable> {
  $$DailyPlansTableFilterComposer({
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

  ColumnFilters<String> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get autoConfirmed => $composableBuilder(
      column: $table.autoConfirmed, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get tasksJson => $composableBuilder(
      column: $table.tasksJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get trainingJson => $composableBuilder(
      column: $table.trainingJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workoutLine => $composableBuilder(
      column: $table.workoutLine, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mealLine => $composableBuilder(
      column: $table.mealLine, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get promptedAt => $composableBuilder(
      column: $table.promptedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get confirmedAt => $composableBuilder(
      column: $table.confirmedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get summarisedAt => $composableBuilder(
      column: $table.summarisedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get briefedAt => $composableBuilder(
      column: $table.briefedAt, builder: (column) => ColumnFilters(column));
}

class $$DailyPlansTableOrderingComposer
    extends Composer<_$AppDatabase, $DailyPlansTable> {
  $$DailyPlansTableOrderingComposer({
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

  ColumnOrderings<String> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get autoConfirmed => $composableBuilder(
      column: $table.autoConfirmed,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get tasksJson => $composableBuilder(
      column: $table.tasksJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get trainingJson => $composableBuilder(
      column: $table.trainingJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workoutLine => $composableBuilder(
      column: $table.workoutLine, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mealLine => $composableBuilder(
      column: $table.mealLine, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get promptedAt => $composableBuilder(
      column: $table.promptedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get confirmedAt => $composableBuilder(
      column: $table.confirmedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get summarisedAt => $composableBuilder(
      column: $table.summarisedAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get briefedAt => $composableBuilder(
      column: $table.briefedAt, builder: (column) => ColumnOrderings(column));
}

class $$DailyPlansTableAnnotationComposer
    extends Composer<_$AppDatabase, $DailyPlansTable> {
  $$DailyPlansTableAnnotationComposer({
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

  GeneratedColumn<String> get date =>
      $composableBuilder(column: $table.date, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<bool> get autoConfirmed => $composableBuilder(
      column: $table.autoConfirmed, builder: (column) => column);

  GeneratedColumn<String> get tasksJson =>
      $composableBuilder(column: $table.tasksJson, builder: (column) => column);

  GeneratedColumn<String> get trainingJson => $composableBuilder(
      column: $table.trainingJson, builder: (column) => column);

  GeneratedColumn<String> get workoutLine => $composableBuilder(
      column: $table.workoutLine, builder: (column) => column);

  GeneratedColumn<String> get mealLine =>
      $composableBuilder(column: $table.mealLine, builder: (column) => column);

  GeneratedColumn<DateTime> get promptedAt => $composableBuilder(
      column: $table.promptedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get confirmedAt => $composableBuilder(
      column: $table.confirmedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get summarisedAt => $composableBuilder(
      column: $table.summarisedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get briefedAt =>
      $composableBuilder(column: $table.briefedAt, builder: (column) => column);
}

class $$DailyPlansTableTableManager extends RootTableManager<
    _$AppDatabase,
    $DailyPlansTable,
    LocalDailyPlan,
    $$DailyPlansTableFilterComposer,
    $$DailyPlansTableOrderingComposer,
    $$DailyPlansTableAnnotationComposer,
    $$DailyPlansTableCreateCompanionBuilder,
    $$DailyPlansTableUpdateCompanionBuilder,
    (
      LocalDailyPlan,
      BaseReferences<_$AppDatabase, $DailyPlansTable, LocalDailyPlan>
    ),
    LocalDailyPlan,
    PrefetchHooks Function()> {
  $$DailyPlansTableTableManager(_$AppDatabase db, $DailyPlansTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$DailyPlansTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$DailyPlansTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$DailyPlansTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> date = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<bool> autoConfirmed = const Value.absent(),
            Value<String> tasksJson = const Value.absent(),
            Value<String?> trainingJson = const Value.absent(),
            Value<String?> workoutLine = const Value.absent(),
            Value<String?> mealLine = const Value.absent(),
            Value<DateTime?> promptedAt = const Value.absent(),
            Value<DateTime?> confirmedAt = const Value.absent(),
            Value<DateTime?> summarisedAt = const Value.absent(),
            Value<DateTime?> briefedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              DailyPlansCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            date: date,
            status: status,
            autoConfirmed: autoConfirmed,
            tasksJson: tasksJson,
            trainingJson: trainingJson,
            workoutLine: workoutLine,
            mealLine: mealLine,
            promptedAt: promptedAt,
            confirmedAt: confirmedAt,
            summarisedAt: summarisedAt,
            briefedAt: briefedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required DateTime updatedAt,
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            required String date,
            Value<String> status = const Value.absent(),
            Value<bool> autoConfirmed = const Value.absent(),
            Value<String> tasksJson = const Value.absent(),
            Value<String?> trainingJson = const Value.absent(),
            Value<String?> workoutLine = const Value.absent(),
            Value<String?> mealLine = const Value.absent(),
            Value<DateTime?> promptedAt = const Value.absent(),
            Value<DateTime?> confirmedAt = const Value.absent(),
            Value<DateTime?> summarisedAt = const Value.absent(),
            Value<DateTime?> briefedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              DailyPlansCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            date: date,
            status: status,
            autoConfirmed: autoConfirmed,
            tasksJson: tasksJson,
            trainingJson: trainingJson,
            workoutLine: workoutLine,
            mealLine: mealLine,
            promptedAt: promptedAt,
            confirmedAt: confirmedAt,
            summarisedAt: summarisedAt,
            briefedAt: briefedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$DailyPlansTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $DailyPlansTable,
    LocalDailyPlan,
    $$DailyPlansTableFilterComposer,
    $$DailyPlansTableOrderingComposer,
    $$DailyPlansTableAnnotationComposer,
    $$DailyPlansTableCreateCompanionBuilder,
    $$DailyPlansTableUpdateCompanionBuilder,
    (
      LocalDailyPlan,
      BaseReferences<_$AppDatabase, $DailyPlansTable, LocalDailyPlan>
    ),
    LocalDailyPlan,
    PrefetchHooks Function()>;
typedef $$CheckinsTableCreateCompanionBuilder = CheckinsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String date,
  Value<int?> mood,
  Value<bool?> adhered,
  Value<String?> note,
  Value<String> source,
  Value<int> rowid,
});
typedef $$CheckinsTableUpdateCompanionBuilder = CheckinsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> date,
  Value<int?> mood,
  Value<bool?> adhered,
  Value<String?> note,
  Value<String> source,
  Value<int> rowid,
});

class $$CheckinsTableFilterComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableFilterComposer({
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

  ColumnFilters<String> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get mood => $composableBuilder(
      column: $table.mood, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get adhered => $composableBuilder(
      column: $table.adhered, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));
}

class $$CheckinsTableOrderingComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableOrderingComposer({
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

  ColumnOrderings<String> get date => $composableBuilder(
      column: $table.date, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get mood => $composableBuilder(
      column: $table.mood, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get adhered => $composableBuilder(
      column: $table.adhered, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));
}

class $$CheckinsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CheckinsTable> {
  $$CheckinsTableAnnotationComposer({
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

  GeneratedColumn<String> get date =>
      $composableBuilder(column: $table.date, builder: (column) => column);

  GeneratedColumn<int> get mood =>
      $composableBuilder(column: $table.mood, builder: (column) => column);

  GeneratedColumn<bool> get adhered =>
      $composableBuilder(column: $table.adhered, builder: (column) => column);

  GeneratedColumn<String> get note =>
      $composableBuilder(column: $table.note, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);
}

class $$CheckinsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CheckinsTable,
    LocalCheckin,
    $$CheckinsTableFilterComposer,
    $$CheckinsTableOrderingComposer,
    $$CheckinsTableAnnotationComposer,
    $$CheckinsTableCreateCompanionBuilder,
    $$CheckinsTableUpdateCompanionBuilder,
    (LocalCheckin, BaseReferences<_$AppDatabase, $CheckinsTable, LocalCheckin>),
    LocalCheckin,
    PrefetchHooks Function()> {
  $$CheckinsTableTableManager(_$AppDatabase db, $CheckinsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CheckinsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CheckinsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CheckinsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> date = const Value.absent(),
            Value<int?> mood = const Value.absent(),
            Value<bool?> adhered = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CheckinsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            date: date,
            mood: mood,
            adhered: adhered,
            note: note,
            source: source,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String id,
            required DateTime updatedAt,
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            required String date,
            Value<int?> mood = const Value.absent(),
            Value<bool?> adhered = const Value.absent(),
            Value<String?> note = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CheckinsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            date: date,
            mood: mood,
            adhered: adhered,
            note: note,
            source: source,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CheckinsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CheckinsTable,
    LocalCheckin,
    $$CheckinsTableFilterComposer,
    $$CheckinsTableOrderingComposer,
    $$CheckinsTableAnnotationComposer,
    $$CheckinsTableCreateCompanionBuilder,
    $$CheckinsTableUpdateCompanionBuilder,
    (LocalCheckin, BaseReferences<_$AppDatabase, $CheckinsTable, LocalCheckin>),
    LocalCheckin,
    PrefetchHooks Function()>;
typedef $$RhythmStateTableCreateCompanionBuilder = RhythmStateCompanion
    Function({
  required String userId,
  Value<String?> lastPlanPromptDate,
  Value<String?> lastEndOfDayDate,
  Value<String?> lastMorningBriefingDate,
  Value<bool> awaitingCheckin,
  Value<DateTime?> awaitingSince,
  Value<int> streakCurrent,
  Value<int> streakBest,
  Value<String?> lastAdheredDate,
  Value<int> rowid,
});
typedef $$RhythmStateTableUpdateCompanionBuilder = RhythmStateCompanion
    Function({
  Value<String> userId,
  Value<String?> lastPlanPromptDate,
  Value<String?> lastEndOfDayDate,
  Value<String?> lastMorningBriefingDate,
  Value<bool> awaitingCheckin,
  Value<DateTime?> awaitingSince,
  Value<int> streakCurrent,
  Value<int> streakBest,
  Value<String?> lastAdheredDate,
  Value<int> rowid,
});

class $$RhythmStateTableFilterComposer
    extends Composer<_$AppDatabase, $RhythmStateTable> {
  $$RhythmStateTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastPlanPromptDate => $composableBuilder(
      column: $table.lastPlanPromptDate,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastEndOfDayDate => $composableBuilder(
      column: $table.lastEndOfDayDate,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastMorningBriefingDate => $composableBuilder(
      column: $table.lastMorningBriefingDate,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get streakCurrent => $composableBuilder(
      column: $table.streakCurrent, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get streakBest => $composableBuilder(
      column: $table.streakBest, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastAdheredDate => $composableBuilder(
      column: $table.lastAdheredDate,
      builder: (column) => ColumnFilters(column));
}

class $$RhythmStateTableOrderingComposer
    extends Composer<_$AppDatabase, $RhythmStateTable> {
  $$RhythmStateTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastPlanPromptDate => $composableBuilder(
      column: $table.lastPlanPromptDate,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastEndOfDayDate => $composableBuilder(
      column: $table.lastEndOfDayDate,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastMorningBriefingDate => $composableBuilder(
      column: $table.lastMorningBriefingDate,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get streakCurrent => $composableBuilder(
      column: $table.streakCurrent,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get streakBest => $composableBuilder(
      column: $table.streakBest, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastAdheredDate => $composableBuilder(
      column: $table.lastAdheredDate,
      builder: (column) => ColumnOrderings(column));
}

class $$RhythmStateTableAnnotationComposer
    extends Composer<_$AppDatabase, $RhythmStateTable> {
  $$RhythmStateTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get lastPlanPromptDate => $composableBuilder(
      column: $table.lastPlanPromptDate, builder: (column) => column);

  GeneratedColumn<String> get lastEndOfDayDate => $composableBuilder(
      column: $table.lastEndOfDayDate, builder: (column) => column);

  GeneratedColumn<String> get lastMorningBriefingDate => $composableBuilder(
      column: $table.lastMorningBriefingDate, builder: (column) => column);

  GeneratedColumn<bool> get awaitingCheckin => $composableBuilder(
      column: $table.awaitingCheckin, builder: (column) => column);

  GeneratedColumn<DateTime> get awaitingSince => $composableBuilder(
      column: $table.awaitingSince, builder: (column) => column);

  GeneratedColumn<int> get streakCurrent => $composableBuilder(
      column: $table.streakCurrent, builder: (column) => column);

  GeneratedColumn<int> get streakBest => $composableBuilder(
      column: $table.streakBest, builder: (column) => column);

  GeneratedColumn<String> get lastAdheredDate => $composableBuilder(
      column: $table.lastAdheredDate, builder: (column) => column);
}

class $$RhythmStateTableTableManager extends RootTableManager<
    _$AppDatabase,
    $RhythmStateTable,
    LocalRhythmState,
    $$RhythmStateTableFilterComposer,
    $$RhythmStateTableOrderingComposer,
    $$RhythmStateTableAnnotationComposer,
    $$RhythmStateTableCreateCompanionBuilder,
    $$RhythmStateTableUpdateCompanionBuilder,
    (
      LocalRhythmState,
      BaseReferences<_$AppDatabase, $RhythmStateTable, LocalRhythmState>
    ),
    LocalRhythmState,
    PrefetchHooks Function()> {
  $$RhythmStateTableTableManager(_$AppDatabase db, $RhythmStateTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$RhythmStateTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$RhythmStateTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$RhythmStateTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> userId = const Value.absent(),
            Value<String?> lastPlanPromptDate = const Value.absent(),
            Value<String?> lastEndOfDayDate = const Value.absent(),
            Value<String?> lastMorningBriefingDate = const Value.absent(),
            Value<bool> awaitingCheckin = const Value.absent(),
            Value<DateTime?> awaitingSince = const Value.absent(),
            Value<int> streakCurrent = const Value.absent(),
            Value<int> streakBest = const Value.absent(),
            Value<String?> lastAdheredDate = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RhythmStateCompanion(
            userId: userId,
            lastPlanPromptDate: lastPlanPromptDate,
            lastEndOfDayDate: lastEndOfDayDate,
            lastMorningBriefingDate: lastMorningBriefingDate,
            awaitingCheckin: awaitingCheckin,
            awaitingSince: awaitingSince,
            streakCurrent: streakCurrent,
            streakBest: streakBest,
            lastAdheredDate: lastAdheredDate,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String userId,
            Value<String?> lastPlanPromptDate = const Value.absent(),
            Value<String?> lastEndOfDayDate = const Value.absent(),
            Value<String?> lastMorningBriefingDate = const Value.absent(),
            Value<bool> awaitingCheckin = const Value.absent(),
            Value<DateTime?> awaitingSince = const Value.absent(),
            Value<int> streakCurrent = const Value.absent(),
            Value<int> streakBest = const Value.absent(),
            Value<String?> lastAdheredDate = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              RhythmStateCompanion.insert(
            userId: userId,
            lastPlanPromptDate: lastPlanPromptDate,
            lastEndOfDayDate: lastEndOfDayDate,
            lastMorningBriefingDate: lastMorningBriefingDate,
            awaitingCheckin: awaitingCheckin,
            awaitingSince: awaitingSince,
            streakCurrent: streakCurrent,
            streakBest: streakBest,
            lastAdheredDate: lastAdheredDate,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$RhythmStateTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $RhythmStateTable,
    LocalRhythmState,
    $$RhythmStateTableFilterComposer,
    $$RhythmStateTableOrderingComposer,
    $$RhythmStateTableAnnotationComposer,
    $$RhythmStateTableCreateCompanionBuilder,
    $$RhythmStateTableUpdateCompanionBuilder,
    (
      LocalRhythmState,
      BaseReferences<_$AppDatabase, $RhythmStateTable, LocalRhythmState>
    ),
    LocalRhythmState,
    PrefetchHooks Function()>;
typedef $$ConversationsTableCreateCompanionBuilder = ConversationsCompanion
    Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> kind,
  Value<String> title,
  Value<bool> pinned,
  Value<bool> archived,
  Value<int> clearedUpToSeq,
  Value<DateTime?> lastMessageAt,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$ConversationsTableUpdateCompanionBuilder = ConversationsCompanion
    Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> kind,
  Value<String> title,
  Value<bool> pinned,
  Value<bool> archived,
  Value<int> clearedUpToSeq,
  Value<DateTime?> lastMessageAt,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$ConversationsTableFilterComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableFilterComposer({
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

  ColumnFilters<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get pinned => $composableBuilder(
      column: $table.pinned, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get clearedUpToSeq => $composableBuilder(
      column: $table.clearedUpToSeq,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$ConversationsTableOrderingComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableOrderingComposer({
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

  ColumnOrderings<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get pinned => $composableBuilder(
      column: $table.pinned, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get archived => $composableBuilder(
      column: $table.archived, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get clearedUpToSeq => $composableBuilder(
      column: $table.clearedUpToSeq,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$ConversationsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ConversationsTable> {
  $$ConversationsTableAnnotationComposer({
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

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<bool> get pinned =>
      $composableBuilder(column: $table.pinned, builder: (column) => column);

  GeneratedColumn<bool> get archived =>
      $composableBuilder(column: $table.archived, builder: (column) => column);

  GeneratedColumn<int> get clearedUpToSeq => $composableBuilder(
      column: $table.clearedUpToSeq, builder: (column) => column);

  GeneratedColumn<DateTime> get lastMessageAt => $composableBuilder(
      column: $table.lastMessageAt, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$ConversationsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ConversationsTable,
    LocalConversation,
    $$ConversationsTableFilterComposer,
    $$ConversationsTableOrderingComposer,
    $$ConversationsTableAnnotationComposer,
    $$ConversationsTableCreateCompanionBuilder,
    $$ConversationsTableUpdateCompanionBuilder,
    (
      LocalConversation,
      BaseReferences<_$AppDatabase, $ConversationsTable, LocalConversation>
    ),
    LocalConversation,
    PrefetchHooks Function()> {
  $$ConversationsTableTableManager(_$AppDatabase db, $ConversationsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ConversationsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ConversationsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ConversationsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<bool> pinned = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            Value<int> clearedUpToSeq = const Value.absent(),
            Value<DateTime?> lastMessageAt = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ConversationsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            kind: kind,
            title: title,
            pinned: pinned,
            archived: archived,
            clearedUpToSeq: clearedUpToSeq,
            lastMessageAt: lastMessageAt,
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
            Value<String> kind = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<bool> pinned = const Value.absent(),
            Value<bool> archived = const Value.absent(),
            Value<int> clearedUpToSeq = const Value.absent(),
            Value<DateTime?> lastMessageAt = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              ConversationsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            kind: kind,
            title: title,
            pinned: pinned,
            archived: archived,
            clearedUpToSeq: clearedUpToSeq,
            lastMessageAt: lastMessageAt,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ConversationsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ConversationsTable,
    LocalConversation,
    $$ConversationsTableFilterComposer,
    $$ConversationsTableOrderingComposer,
    $$ConversationsTableAnnotationComposer,
    $$ConversationsTableCreateCompanionBuilder,
    $$ConversationsTableUpdateCompanionBuilder,
    (
      LocalConversation,
      BaseReferences<_$AppDatabase, $ConversationsTable, LocalConversation>
    ),
    LocalConversation,
    PrefetchHooks Function()>;
typedef $$MessagesTableCreateCompanionBuilder = MessagesCompanion Function({
  Value<int> seq,
  required String conversationId,
  required String role,
  required String content,
  Value<String?> clientId,
  Value<DateTime?> composedAt,
  required DateTime createdAt,
});
typedef $$MessagesTableUpdateCompanionBuilder = MessagesCompanion Function({
  Value<int> seq,
  Value<String> conversationId,
  Value<String> role,
  Value<String> content,
  Value<String?> clientId,
  Value<DateTime?> composedAt,
  Value<DateTime> createdAt,
});

class $$MessagesTableFilterComposer
    extends Composer<_$AppDatabase, $MessagesTable> {
  $$MessagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get seq => $composableBuilder(
      column: $table.seq, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get role => $composableBuilder(
      column: $table.role, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get content => $composableBuilder(
      column: $table.content, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$MessagesTableOrderingComposer
    extends Composer<_$AppDatabase, $MessagesTable> {
  $$MessagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get seq => $composableBuilder(
      column: $table.seq, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get role => $composableBuilder(
      column: $table.role, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get content => $composableBuilder(
      column: $table.content, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$MessagesTableAnnotationComposer
    extends Composer<_$AppDatabase, $MessagesTable> {
  $$MessagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get seq =>
      $composableBuilder(column: $table.seq, builder: (column) => column);

  GeneratedColumn<String> get conversationId => $composableBuilder(
      column: $table.conversationId, builder: (column) => column);

  GeneratedColumn<String> get role =>
      $composableBuilder(column: $table.role, builder: (column) => column);

  GeneratedColumn<String> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$MessagesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $MessagesTable,
    LocalMessage,
    $$MessagesTableFilterComposer,
    $$MessagesTableOrderingComposer,
    $$MessagesTableAnnotationComposer,
    $$MessagesTableCreateCompanionBuilder,
    $$MessagesTableUpdateCompanionBuilder,
    (LocalMessage, BaseReferences<_$AppDatabase, $MessagesTable, LocalMessage>),
    LocalMessage,
    PrefetchHooks Function()> {
  $$MessagesTableTableManager(_$AppDatabase db, $MessagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MessagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MessagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MessagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<int> seq = const Value.absent(),
            Value<String> conversationId = const Value.absent(),
            Value<String> role = const Value.absent(),
            Value<String> content = const Value.absent(),
            Value<String?> clientId = const Value.absent(),
            Value<DateTime?> composedAt = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
          }) =>
              MessagesCompanion(
            seq: seq,
            conversationId: conversationId,
            role: role,
            content: content,
            clientId: clientId,
            composedAt: composedAt,
            createdAt: createdAt,
          ),
          createCompanionCallback: ({
            Value<int> seq = const Value.absent(),
            required String conversationId,
            required String role,
            required String content,
            Value<String?> clientId = const Value.absent(),
            Value<DateTime?> composedAt = const Value.absent(),
            required DateTime createdAt,
          }) =>
              MessagesCompanion.insert(
            seq: seq,
            conversationId: conversationId,
            role: role,
            content: content,
            clientId: clientId,
            composedAt: composedAt,
            createdAt: createdAt,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$MessagesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $MessagesTable,
    LocalMessage,
    $$MessagesTableFilterComposer,
    $$MessagesTableOrderingComposer,
    $$MessagesTableAnnotationComposer,
    $$MessagesTableCreateCompanionBuilder,
    $$MessagesTableUpdateCompanionBuilder,
    (LocalMessage, BaseReferences<_$AppDatabase, $MessagesTable, LocalMessage>),
    LocalMessage,
    PrefetchHooks Function()>;
typedef $$PendingMessagesTableCreateCompanionBuilder = PendingMessagesCompanion
    Function({
  required String clientId,
  required String conversationId,
  required String body,
  required DateTime composedAt,
  Value<int> attempts,
  Value<int> rowid,
});
typedef $$PendingMessagesTableUpdateCompanionBuilder = PendingMessagesCompanion
    Function({
  Value<String> clientId,
  Value<String> conversationId,
  Value<String> body,
  Value<DateTime> composedAt,
  Value<int> attempts,
  Value<int> rowid,
});

class $$PendingMessagesTableFilterComposer
    extends Composer<_$AppDatabase, $PendingMessagesTable> {
  $$PendingMessagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get body => $composableBuilder(
      column: $table.body, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnFilters(column));
}

class $$PendingMessagesTableOrderingComposer
    extends Composer<_$AppDatabase, $PendingMessagesTable> {
  $$PendingMessagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get conversationId => $composableBuilder(
      column: $table.conversationId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get body => $composableBuilder(
      column: $table.body, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnOrderings(column));
}

class $$PendingMessagesTableAnnotationComposer
    extends Composer<_$AppDatabase, $PendingMessagesTable> {
  $$PendingMessagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get clientId =>
      $composableBuilder(column: $table.clientId, builder: (column) => column);

  GeneratedColumn<String> get conversationId => $composableBuilder(
      column: $table.conversationId, builder: (column) => column);

  GeneratedColumn<String> get body =>
      $composableBuilder(column: $table.body, builder: (column) => column);

  GeneratedColumn<DateTime> get composedAt => $composableBuilder(
      column: $table.composedAt, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);
}

class $$PendingMessagesTableTableManager extends RootTableManager<
    _$AppDatabase,
    $PendingMessagesTable,
    LocalPendingMessage,
    $$PendingMessagesTableFilterComposer,
    $$PendingMessagesTableOrderingComposer,
    $$PendingMessagesTableAnnotationComposer,
    $$PendingMessagesTableCreateCompanionBuilder,
    $$PendingMessagesTableUpdateCompanionBuilder,
    (
      LocalPendingMessage,
      BaseReferences<_$AppDatabase, $PendingMessagesTable, LocalPendingMessage>
    ),
    LocalPendingMessage,
    PrefetchHooks Function()> {
  $$PendingMessagesTableTableManager(
      _$AppDatabase db, $PendingMessagesTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$PendingMessagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$PendingMessagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$PendingMessagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> clientId = const Value.absent(),
            Value<String> conversationId = const Value.absent(),
            Value<String> body = const Value.absent(),
            Value<DateTime> composedAt = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingMessagesCompanion(
            clientId: clientId,
            conversationId: conversationId,
            body: body,
            composedAt: composedAt,
            attempts: attempts,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String clientId,
            required String conversationId,
            required String body,
            required DateTime composedAt,
            Value<int> attempts = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              PendingMessagesCompanion.insert(
            clientId: clientId,
            conversationId: conversationId,
            body: body,
            composedAt: composedAt,
            attempts: attempts,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$PendingMessagesTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $PendingMessagesTable,
    LocalPendingMessage,
    $$PendingMessagesTableFilterComposer,
    $$PendingMessagesTableOrderingComposer,
    $$PendingMessagesTableAnnotationComposer,
    $$PendingMessagesTableCreateCompanionBuilder,
    $$PendingMessagesTableUpdateCompanionBuilder,
    (
      LocalPendingMessage,
      BaseReferences<_$AppDatabase, $PendingMessagesTable, LocalPendingMessage>
    ),
    LocalPendingMessage,
    PrefetchHooks Function()>;
typedef $$MeetingsTableCreateCompanionBuilder = MeetingsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String title,
  Value<String?> description,
  required DateTime startAt,
  Value<int> durationMin,
  Value<bool> allDay,
  Value<String?> lockTimezone,
  Value<String> authoredTimezone,
  Value<String?> locationJson,
  Value<String?> prepNotes,
  Value<int> prepMinutes,
  Value<String> reminderOffsetsJson,
  Value<String?> recurrenceJson,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String> source,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$MeetingsTableUpdateCompanionBuilder = MeetingsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> title,
  Value<String?> description,
  Value<DateTime> startAt,
  Value<int> durationMin,
  Value<bool> allDay,
  Value<String?> lockTimezone,
  Value<String> authoredTimezone,
  Value<String?> locationJson,
  Value<String?> prepNotes,
  Value<int> prepMinutes,
  Value<String> reminderOffsetsJson,
  Value<String?> recurrenceJson,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String> source,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$MeetingsTableFilterComposer
    extends Composer<_$AppDatabase, $MeetingsTable> {
  $$MeetingsTableFilterComposer({
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

  ColumnFilters<String> get description => $composableBuilder(
      column: $table.description, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get startAt => $composableBuilder(
      column: $table.startAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lockTimezone => $composableBuilder(
      column: $table.lockTimezone, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get locationJson => $composableBuilder(
      column: $table.locationJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get prepNotes => $composableBuilder(
      column: $table.prepNotes, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get prepMinutes => $composableBuilder(
      column: $table.prepMinutes, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get reminderOffsetsJson => $composableBuilder(
      column: $table.reminderOffsetsJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$MeetingsTableOrderingComposer
    extends Composer<_$AppDatabase, $MeetingsTable> {
  $$MeetingsTableOrderingComposer({
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

  ColumnOrderings<String> get description => $composableBuilder(
      column: $table.description, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get startAt => $composableBuilder(
      column: $table.startAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lockTimezone => $composableBuilder(
      column: $table.lockTimezone,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get locationJson => $composableBuilder(
      column: $table.locationJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get prepNotes => $composableBuilder(
      column: $table.prepNotes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get prepMinutes => $composableBuilder(
      column: $table.prepMinutes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get reminderOffsetsJson => $composableBuilder(
      column: $table.reminderOffsetsJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$MeetingsTableAnnotationComposer
    extends Composer<_$AppDatabase, $MeetingsTable> {
  $$MeetingsTableAnnotationComposer({
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

  GeneratedColumn<String> get description => $composableBuilder(
      column: $table.description, builder: (column) => column);

  GeneratedColumn<DateTime> get startAt =>
      $composableBuilder(column: $table.startAt, builder: (column) => column);

  GeneratedColumn<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => column);

  GeneratedColumn<bool> get allDay =>
      $composableBuilder(column: $table.allDay, builder: (column) => column);

  GeneratedColumn<String> get lockTimezone => $composableBuilder(
      column: $table.lockTimezone, builder: (column) => column);

  GeneratedColumn<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone, builder: (column) => column);

  GeneratedColumn<String> get locationJson => $composableBuilder(
      column: $table.locationJson, builder: (column) => column);

  GeneratedColumn<String> get prepNotes =>
      $composableBuilder(column: $table.prepNotes, builder: (column) => column);

  GeneratedColumn<int> get prepMinutes => $composableBuilder(
      column: $table.prepMinutes, builder: (column) => column);

  GeneratedColumn<String> get reminderOffsetsJson => $composableBuilder(
      column: $table.reminderOffsetsJson, builder: (column) => column);

  GeneratedColumn<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$MeetingsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $MeetingsTable,
    LocalMeeting,
    $$MeetingsTableFilterComposer,
    $$MeetingsTableOrderingComposer,
    $$MeetingsTableAnnotationComposer,
    $$MeetingsTableCreateCompanionBuilder,
    $$MeetingsTableUpdateCompanionBuilder,
    (LocalMeeting, BaseReferences<_$AppDatabase, $MeetingsTable, LocalMeeting>),
    LocalMeeting,
    PrefetchHooks Function()> {
  $$MeetingsTableTableManager(_$AppDatabase db, $MeetingsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$MeetingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$MeetingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$MeetingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String?> description = const Value.absent(),
            Value<DateTime> startAt = const Value.absent(),
            Value<int> durationMin = const Value.absent(),
            Value<bool> allDay = const Value.absent(),
            Value<String?> lockTimezone = const Value.absent(),
            Value<String> authoredTimezone = const Value.absent(),
            Value<String?> locationJson = const Value.absent(),
            Value<String?> prepNotes = const Value.absent(),
            Value<int> prepMinutes = const Value.absent(),
            Value<String> reminderOffsetsJson = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              MeetingsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            description: description,
            startAt: startAt,
            durationMin: durationMin,
            allDay: allDay,
            lockTimezone: lockTimezone,
            authoredTimezone: authoredTimezone,
            locationJson: locationJson,
            prepNotes: prepNotes,
            prepMinutes: prepMinutes,
            reminderOffsetsJson: reminderOffsetsJson,
            recurrenceJson: recurrenceJson,
            status: status,
            completedAt: completedAt,
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
            Value<String?> description = const Value.absent(),
            required DateTime startAt,
            Value<int> durationMin = const Value.absent(),
            Value<bool> allDay = const Value.absent(),
            Value<String?> lockTimezone = const Value.absent(),
            Value<String> authoredTimezone = const Value.absent(),
            Value<String?> locationJson = const Value.absent(),
            Value<String?> prepNotes = const Value.absent(),
            Value<int> prepMinutes = const Value.absent(),
            Value<String> reminderOffsetsJson = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String> source = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              MeetingsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            description: description,
            startAt: startAt,
            durationMin: durationMin,
            allDay: allDay,
            lockTimezone: lockTimezone,
            authoredTimezone: authoredTimezone,
            locationJson: locationJson,
            prepNotes: prepNotes,
            prepMinutes: prepMinutes,
            reminderOffsetsJson: reminderOffsetsJson,
            recurrenceJson: recurrenceJson,
            status: status,
            completedAt: completedAt,
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

typedef $$MeetingsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $MeetingsTable,
    LocalMeeting,
    $$MeetingsTableFilterComposer,
    $$MeetingsTableOrderingComposer,
    $$MeetingsTableAnnotationComposer,
    $$MeetingsTableCreateCompanionBuilder,
    $$MeetingsTableUpdateCompanionBuilder,
    (LocalMeeting, BaseReferences<_$AppDatabase, $MeetingsTable, LocalMeeting>),
    LocalMeeting,
    PrefetchHooks Function()>;
typedef $$CalendarEventsTableCreateCompanionBuilder = CalendarEventsCompanion
    Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String title,
  Value<String?> notes,
  required DateTime startAt,
  required DateTime endAt,
  Value<bool> allDay,
  Value<String?> color,
  Value<String?> recurrenceJson,
  Value<String> authoredTimezone,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$CalendarEventsTableUpdateCompanionBuilder = CalendarEventsCompanion
    Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> title,
  Value<String?> notes,
  Value<DateTime> startAt,
  Value<DateTime> endAt,
  Value<bool> allDay,
  Value<String?> color,
  Value<String?> recurrenceJson,
  Value<String> authoredTimezone,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$CalendarEventsTableFilterComposer
    extends Composer<_$AppDatabase, $CalendarEventsTable> {
  $$CalendarEventsTableFilterComposer({
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

  ColumnFilters<DateTime> get startAt => $composableBuilder(
      column: $table.startAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get endAt => $composableBuilder(
      column: $table.endAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get color => $composableBuilder(
      column: $table.color, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$CalendarEventsTableOrderingComposer
    extends Composer<_$AppDatabase, $CalendarEventsTable> {
  $$CalendarEventsTableOrderingComposer({
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

  ColumnOrderings<DateTime> get startAt => $composableBuilder(
      column: $table.startAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get endAt => $composableBuilder(
      column: $table.endAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get allDay => $composableBuilder(
      column: $table.allDay, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get color => $composableBuilder(
      column: $table.color, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$CalendarEventsTableAnnotationComposer
    extends Composer<_$AppDatabase, $CalendarEventsTable> {
  $$CalendarEventsTableAnnotationComposer({
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

  GeneratedColumn<DateTime> get startAt =>
      $composableBuilder(column: $table.startAt, builder: (column) => column);

  GeneratedColumn<DateTime> get endAt =>
      $composableBuilder(column: $table.endAt, builder: (column) => column);

  GeneratedColumn<bool> get allDay =>
      $composableBuilder(column: $table.allDay, builder: (column) => column);

  GeneratedColumn<String> get color =>
      $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<String> get recurrenceJson => $composableBuilder(
      column: $table.recurrenceJson, builder: (column) => column);

  GeneratedColumn<String> get authoredTimezone => $composableBuilder(
      column: $table.authoredTimezone, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$CalendarEventsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $CalendarEventsTable,
    LocalCalendarEvent,
    $$CalendarEventsTableFilterComposer,
    $$CalendarEventsTableOrderingComposer,
    $$CalendarEventsTableAnnotationComposer,
    $$CalendarEventsTableCreateCompanionBuilder,
    $$CalendarEventsTableUpdateCompanionBuilder,
    (
      LocalCalendarEvent,
      BaseReferences<_$AppDatabase, $CalendarEventsTable, LocalCalendarEvent>
    ),
    LocalCalendarEvent,
    PrefetchHooks Function()> {
  $$CalendarEventsTableTableManager(
      _$AppDatabase db, $CalendarEventsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CalendarEventsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CalendarEventsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CalendarEventsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<DateTime> startAt = const Value.absent(),
            Value<DateTime> endAt = const Value.absent(),
            Value<bool> allDay = const Value.absent(),
            Value<String?> color = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<String> authoredTimezone = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              CalendarEventsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            notes: notes,
            startAt: startAt,
            endAt: endAt,
            allDay: allDay,
            color: color,
            recurrenceJson: recurrenceJson,
            authoredTimezone: authoredTimezone,
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
            required DateTime startAt,
            required DateTime endAt,
            Value<bool> allDay = const Value.absent(),
            Value<String?> color = const Value.absent(),
            Value<String?> recurrenceJson = const Value.absent(),
            Value<String> authoredTimezone = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              CalendarEventsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            notes: notes,
            startAt: startAt,
            endAt: endAt,
            allDay: allDay,
            color: color,
            recurrenceJson: recurrenceJson,
            authoredTimezone: authoredTimezone,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$CalendarEventsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $CalendarEventsTable,
    LocalCalendarEvent,
    $$CalendarEventsTableFilterComposer,
    $$CalendarEventsTableOrderingComposer,
    $$CalendarEventsTableAnnotationComposer,
    $$CalendarEventsTableCreateCompanionBuilder,
    $$CalendarEventsTableUpdateCompanionBuilder,
    (
      LocalCalendarEvent,
      BaseReferences<_$AppDatabase, $CalendarEventsTable, LocalCalendarEvent>
    ),
    LocalCalendarEvent,
    PrefetchHooks Function()>;
typedef $$AthleteProfileTableCreateCompanionBuilder = AthleteProfileCompanion
    Function({
  required String userId,
  Value<String> sportsJson,
  Value<String> slotsJson,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  required DateTime fetchedAt,
  Value<int> rowid,
});
typedef $$AthleteProfileTableUpdateCompanionBuilder = AthleteProfileCompanion
    Function({
  Value<String> userId,
  Value<String> sportsJson,
  Value<String> slotsJson,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime> fetchedAt,
  Value<int> rowid,
});

class $$AthleteProfileTableFilterComposer
    extends Composer<_$AppDatabase, $AthleteProfileTable> {
  $$AthleteProfileTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sportsJson => $composableBuilder(
      column: $table.sportsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get slotsJson => $composableBuilder(
      column: $table.slotsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnFilters(column));
}

class $$AthleteProfileTableOrderingComposer
    extends Composer<_$AppDatabase, $AthleteProfileTable> {
  $$AthleteProfileTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sportsJson => $composableBuilder(
      column: $table.sportsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get slotsJson => $composableBuilder(
      column: $table.slotsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get pendingOp => $composableBuilder(
      column: $table.pendingOp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
      column: $table.fetchedAt, builder: (column) => ColumnOrderings(column));
}

class $$AthleteProfileTableAnnotationComposer
    extends Composer<_$AppDatabase, $AthleteProfileTable> {
  $$AthleteProfileTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get userId =>
      $composableBuilder(column: $table.userId, builder: (column) => column);

  GeneratedColumn<String> get sportsJson => $composableBuilder(
      column: $table.sportsJson, builder: (column) => column);

  GeneratedColumn<String> get slotsJson =>
      $composableBuilder(column: $table.slotsJson, builder: (column) => column);

  GeneratedColumn<String> get pendingOp =>
      $composableBuilder(column: $table.pendingOp, builder: (column) => column);

  GeneratedColumn<int> get pushAttempts => $composableBuilder(
      column: $table.pushAttempts, builder: (column) => column);

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$AthleteProfileTableTableManager extends RootTableManager<
    _$AppDatabase,
    $AthleteProfileTable,
    LocalAthleteProfile,
    $$AthleteProfileTableFilterComposer,
    $$AthleteProfileTableOrderingComposer,
    $$AthleteProfileTableAnnotationComposer,
    $$AthleteProfileTableCreateCompanionBuilder,
    $$AthleteProfileTableUpdateCompanionBuilder,
    (
      LocalAthleteProfile,
      BaseReferences<_$AppDatabase, $AthleteProfileTable, LocalAthleteProfile>
    ),
    LocalAthleteProfile,
    PrefetchHooks Function()> {
  $$AthleteProfileTableTableManager(
      _$AppDatabase db, $AthleteProfileTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$AthleteProfileTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$AthleteProfileTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$AthleteProfileTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> userId = const Value.absent(),
            Value<String> sportsJson = const Value.absent(),
            Value<String> slotsJson = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime> fetchedAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              AthleteProfileCompanion(
            userId: userId,
            sportsJson: sportsJson,
            slotsJson: slotsJson,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          createCompanionCallback: ({
            required String userId,
            Value<String> sportsJson = const Value.absent(),
            Value<String> slotsJson = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            required DateTime fetchedAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              AthleteProfileCompanion.insert(
            userId: userId,
            sportsJson: sportsJson,
            slotsJson: slotsJson,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            fetchedAt: fetchedAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$AthleteProfileTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $AthleteProfileTable,
    LocalAthleteProfile,
    $$AthleteProfileTableFilterComposer,
    $$AthleteProfileTableOrderingComposer,
    $$AthleteProfileTableAnnotationComposer,
    $$AthleteProfileTableCreateCompanionBuilder,
    $$AthleteProfileTableUpdateCompanionBuilder,
    (
      LocalAthleteProfile,
      BaseReferences<_$AppDatabase, $AthleteProfileTable, LocalAthleteProfile>
    ),
    LocalAthleteProfile,
    PrefetchHooks Function()>;
typedef $$ProgramsTableCreateCompanionBuilder = ProgramsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String title,
  required String sport,
  Value<String> source,
  Value<String> sourceLinkIdsJson,
  Value<String> weeksJson,
  Value<String> status,
  Value<String?> appliedStartDate,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$ProgramsTableUpdateCompanionBuilder = ProgramsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> title,
  Value<String> sport,
  Value<String> source,
  Value<String> sourceLinkIdsJson,
  Value<String> weeksJson,
  Value<String> status,
  Value<String?> appliedStartDate,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$ProgramsTableFilterComposer
    extends Composer<_$AppDatabase, $ProgramsTable> {
  $$ProgramsTableFilterComposer({
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

  ColumnFilters<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sourceLinkIdsJson => $composableBuilder(
      column: $table.sourceLinkIdsJson,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get weeksJson => $composableBuilder(
      column: $table.weeksJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get appliedStartDate => $composableBuilder(
      column: $table.appliedStartDate,
      builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$ProgramsTableOrderingComposer
    extends Composer<_$AppDatabase, $ProgramsTable> {
  $$ProgramsTableOrderingComposer({
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

  ColumnOrderings<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source => $composableBuilder(
      column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sourceLinkIdsJson => $composableBuilder(
      column: $table.sourceLinkIdsJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get weeksJson => $composableBuilder(
      column: $table.weeksJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get appliedStartDate => $composableBuilder(
      column: $table.appliedStartDate,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$ProgramsTableAnnotationComposer
    extends Composer<_$AppDatabase, $ProgramsTable> {
  $$ProgramsTableAnnotationComposer({
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

  GeneratedColumn<String> get sport =>
      $composableBuilder(column: $table.sport, builder: (column) => column);

  GeneratedColumn<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<String> get sourceLinkIdsJson => $composableBuilder(
      column: $table.sourceLinkIdsJson, builder: (column) => column);

  GeneratedColumn<String> get weeksJson =>
      $composableBuilder(column: $table.weeksJson, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get appliedStartDate => $composableBuilder(
      column: $table.appliedStartDate, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$ProgramsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $ProgramsTable,
    LocalProgram,
    $$ProgramsTableFilterComposer,
    $$ProgramsTableOrderingComposer,
    $$ProgramsTableAnnotationComposer,
    $$ProgramsTableCreateCompanionBuilder,
    $$ProgramsTableUpdateCompanionBuilder,
    (LocalProgram, BaseReferences<_$AppDatabase, $ProgramsTable, LocalProgram>),
    LocalProgram,
    PrefetchHooks Function()> {
  $$ProgramsTableTableManager(_$AppDatabase db, $ProgramsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ProgramsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ProgramsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ProgramsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String> sport = const Value.absent(),
            Value<String> source = const Value.absent(),
            Value<String> sourceLinkIdsJson = const Value.absent(),
            Value<String> weeksJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> appliedStartDate = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              ProgramsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            sport: sport,
            source: source,
            sourceLinkIdsJson: sourceLinkIdsJson,
            weeksJson: weeksJson,
            status: status,
            appliedStartDate: appliedStartDate,
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
            required String sport,
            Value<String> source = const Value.absent(),
            Value<String> sourceLinkIdsJson = const Value.absent(),
            Value<String> weeksJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> appliedStartDate = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              ProgramsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            title: title,
            sport: sport,
            source: source,
            sourceLinkIdsJson: sourceLinkIdsJson,
            weeksJson: weeksJson,
            status: status,
            appliedStartDate: appliedStartDate,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$ProgramsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $ProgramsTable,
    LocalProgram,
    $$ProgramsTableFilterComposer,
    $$ProgramsTableOrderingComposer,
    $$ProgramsTableAnnotationComposer,
    $$ProgramsTableCreateCompanionBuilder,
    $$ProgramsTableUpdateCompanionBuilder,
    (LocalProgram, BaseReferences<_$AppDatabase, $ProgramsTable, LocalProgram>),
    LocalProgram,
    PrefetchHooks Function()>;
typedef $$WorkoutsTableCreateCompanionBuilder = WorkoutsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String name,
  required String sport,
  Value<String> exercisesJson,
  Value<String> tagsJson,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$WorkoutsTableUpdateCompanionBuilder = WorkoutsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> name,
  Value<String> sport,
  Value<String> exercisesJson,
  Value<String> tagsJson,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$WorkoutsTableFilterComposer
    extends Composer<_$AppDatabase, $WorkoutsTable> {
  $$WorkoutsTableFilterComposer({
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

  ColumnFilters<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get tagsJson => $composableBuilder(
      column: $table.tagsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$WorkoutsTableOrderingComposer
    extends Composer<_$AppDatabase, $WorkoutsTable> {
  $$WorkoutsTableOrderingComposer({
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

  ColumnOrderings<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get tagsJson => $composableBuilder(
      column: $table.tagsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$WorkoutsTableAnnotationComposer
    extends Composer<_$AppDatabase, $WorkoutsTable> {
  $$WorkoutsTableAnnotationComposer({
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

  GeneratedColumn<String> get sport =>
      $composableBuilder(column: $table.sport, builder: (column) => column);

  GeneratedColumn<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson, builder: (column) => column);

  GeneratedColumn<String> get tagsJson =>
      $composableBuilder(column: $table.tagsJson, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$WorkoutsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $WorkoutsTable,
    LocalWorkout,
    $$WorkoutsTableFilterComposer,
    $$WorkoutsTableOrderingComposer,
    $$WorkoutsTableAnnotationComposer,
    $$WorkoutsTableCreateCompanionBuilder,
    $$WorkoutsTableUpdateCompanionBuilder,
    (LocalWorkout, BaseReferences<_$AppDatabase, $WorkoutsTable, LocalWorkout>),
    LocalWorkout,
    PrefetchHooks Function()> {
  $$WorkoutsTableTableManager(_$AppDatabase db, $WorkoutsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WorkoutsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WorkoutsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WorkoutsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<String> sport = const Value.absent(),
            Value<String> exercisesJson = const Value.absent(),
            Value<String> tagsJson = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              WorkoutsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            name: name,
            sport: sport,
            exercisesJson: exercisesJson,
            tagsJson: tagsJson,
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
            required String sport,
            Value<String> exercisesJson = const Value.absent(),
            Value<String> tagsJson = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              WorkoutsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            name: name,
            sport: sport,
            exercisesJson: exercisesJson,
            tagsJson: tagsJson,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$WorkoutsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $WorkoutsTable,
    LocalWorkout,
    $$WorkoutsTableFilterComposer,
    $$WorkoutsTableOrderingComposer,
    $$WorkoutsTableAnnotationComposer,
    $$WorkoutsTableCreateCompanionBuilder,
    $$WorkoutsTableUpdateCompanionBuilder,
    (LocalWorkout, BaseReferences<_$AppDatabase, $WorkoutsTable, LocalWorkout>),
    LocalWorkout,
    PrefetchHooks Function()>;
typedef $$SessionsTableCreateCompanionBuilder = SessionsCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required DateTime plannedAt,
  Value<int> durationMin,
  required String sport,
  required String title,
  Value<String?> focus,
  Value<String?> programId,
  Value<int?> weekIndex,
  Value<String?> slotId,
  Value<String?> suggestionId,
  Value<String> exercisesJson,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String?> notes,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$SessionsTableUpdateCompanionBuilder = SessionsCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<DateTime> plannedAt,
  Value<int> durationMin,
  Value<String> sport,
  Value<String> title,
  Value<String?> focus,
  Value<String?> programId,
  Value<int?> weekIndex,
  Value<String?> slotId,
  Value<String?> suggestionId,
  Value<String> exercisesJson,
  Value<String> status,
  Value<DateTime?> completedAt,
  Value<String?> notes,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$SessionsTableFilterComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableFilterComposer({
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

  ColumnFilters<DateTime> get plannedAt => $composableBuilder(
      column: $table.plannedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get focus => $composableBuilder(
      column: $table.focus, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get programId => $composableBuilder(
      column: $table.programId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get weekIndex => $composableBuilder(
      column: $table.weekIndex, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get slotId => $composableBuilder(
      column: $table.slotId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get suggestionId => $composableBuilder(
      column: $table.suggestionId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$SessionsTableOrderingComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableOrderingComposer({
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

  ColumnOrderings<DateTime> get plannedAt => $composableBuilder(
      column: $table.plannedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sport => $composableBuilder(
      column: $table.sport, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get focus => $composableBuilder(
      column: $table.focus, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get programId => $composableBuilder(
      column: $table.programId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get weekIndex => $composableBuilder(
      column: $table.weekIndex, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get slotId => $composableBuilder(
      column: $table.slotId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get suggestionId => $composableBuilder(
      column: $table.suggestionId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$SessionsTableAnnotationComposer
    extends Composer<_$AppDatabase, $SessionsTable> {
  $$SessionsTableAnnotationComposer({
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

  GeneratedColumn<DateTime> get plannedAt =>
      $composableBuilder(column: $table.plannedAt, builder: (column) => column);

  GeneratedColumn<int> get durationMin => $composableBuilder(
      column: $table.durationMin, builder: (column) => column);

  GeneratedColumn<String> get sport =>
      $composableBuilder(column: $table.sport, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get focus =>
      $composableBuilder(column: $table.focus, builder: (column) => column);

  GeneratedColumn<String> get programId =>
      $composableBuilder(column: $table.programId, builder: (column) => column);

  GeneratedColumn<int> get weekIndex =>
      $composableBuilder(column: $table.weekIndex, builder: (column) => column);

  GeneratedColumn<String> get slotId =>
      $composableBuilder(column: $table.slotId, builder: (column) => column);

  GeneratedColumn<String> get suggestionId => $composableBuilder(
      column: $table.suggestionId, builder: (column) => column);

  GeneratedColumn<String> get exercisesJson => $composableBuilder(
      column: $table.exercisesJson, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<DateTime> get completedAt => $composableBuilder(
      column: $table.completedAt, builder: (column) => column);

  GeneratedColumn<String> get notes =>
      $composableBuilder(column: $table.notes, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$SessionsTableTableManager extends RootTableManager<
    _$AppDatabase,
    $SessionsTable,
    LocalSession,
    $$SessionsTableFilterComposer,
    $$SessionsTableOrderingComposer,
    $$SessionsTableAnnotationComposer,
    $$SessionsTableCreateCompanionBuilder,
    $$SessionsTableUpdateCompanionBuilder,
    (LocalSession, BaseReferences<_$AppDatabase, $SessionsTable, LocalSession>),
    LocalSession,
    PrefetchHooks Function()> {
  $$SessionsTableTableManager(_$AppDatabase db, $SessionsTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SessionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SessionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SessionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<DateTime> plannedAt = const Value.absent(),
            Value<int> durationMin = const Value.absent(),
            Value<String> sport = const Value.absent(),
            Value<String> title = const Value.absent(),
            Value<String?> focus = const Value.absent(),
            Value<String?> programId = const Value.absent(),
            Value<int?> weekIndex = const Value.absent(),
            Value<String?> slotId = const Value.absent(),
            Value<String?> suggestionId = const Value.absent(),
            Value<String> exercisesJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              SessionsCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            plannedAt: plannedAt,
            durationMin: durationMin,
            sport: sport,
            title: title,
            focus: focus,
            programId: programId,
            weekIndex: weekIndex,
            slotId: slotId,
            suggestionId: suggestionId,
            exercisesJson: exercisesJson,
            status: status,
            completedAt: completedAt,
            notes: notes,
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
            required DateTime plannedAt,
            Value<int> durationMin = const Value.absent(),
            required String sport,
            required String title,
            Value<String?> focus = const Value.absent(),
            Value<String?> programId = const Value.absent(),
            Value<int?> weekIndex = const Value.absent(),
            Value<String?> slotId = const Value.absent(),
            Value<String?> suggestionId = const Value.absent(),
            Value<String> exercisesJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<DateTime?> completedAt = const Value.absent(),
            Value<String?> notes = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              SessionsCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            plannedAt: plannedAt,
            durationMin: durationMin,
            sport: sport,
            title: title,
            focus: focus,
            programId: programId,
            weekIndex: weekIndex,
            slotId: slotId,
            suggestionId: suggestionId,
            exercisesJson: exercisesJson,
            status: status,
            completedAt: completedAt,
            notes: notes,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$SessionsTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $SessionsTable,
    LocalSession,
    $$SessionsTableFilterComposer,
    $$SessionsTableOrderingComposer,
    $$SessionsTableAnnotationComposer,
    $$SessionsTableCreateCompanionBuilder,
    $$SessionsTableUpdateCompanionBuilder,
    (LocalSession, BaseReferences<_$AppDatabase, $SessionsTable, LocalSession>),
    LocalSession,
    PrefetchHooks Function()>;
typedef $$LinksTableCreateCompanionBuilder = LinksCompanion Function({
  required String id,
  required DateTime updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  required String url,
  Value<String> kind,
  Value<String?> title,
  Value<String> tagsJson,
  Value<String> status,
  Value<String?> failReason,
  Value<int> attempts,
  Value<String?> parentLinkId,
  Value<int?> skippedCount,
  Value<String?> docId,
  required DateTime addedAt,
  Value<DateTime?> processedAt,
  required DateTime createdAt,
  Value<int> rowid,
});
typedef $$LinksTableUpdateCompanionBuilder = LinksCompanion Function({
  Value<String> id,
  Value<DateTime> updatedAt,
  Value<DateTime?> baseUpdatedAt,
  Value<String?> pendingOp,
  Value<int> pushAttempts,
  Value<DateTime?> deletedAt,
  Value<String> url,
  Value<String> kind,
  Value<String?> title,
  Value<String> tagsJson,
  Value<String> status,
  Value<String?> failReason,
  Value<int> attempts,
  Value<String?> parentLinkId,
  Value<int?> skippedCount,
  Value<String?> docId,
  Value<DateTime> addedAt,
  Value<DateTime?> processedAt,
  Value<DateTime> createdAt,
  Value<int> rowid,
});

class $$LinksTableFilterComposer extends Composer<_$AppDatabase, $LinksTable> {
  $$LinksTableFilterComposer({
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

  ColumnFilters<String> get url => $composableBuilder(
      column: $table.url, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get tagsJson => $composableBuilder(
      column: $table.tagsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get failReason => $composableBuilder(
      column: $table.failReason, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get parentLinkId => $composableBuilder(
      column: $table.parentLinkId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get skippedCount => $composableBuilder(
      column: $table.skippedCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get docId => $composableBuilder(
      column: $table.docId, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get addedAt => $composableBuilder(
      column: $table.addedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get processedAt => $composableBuilder(
      column: $table.processedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$LinksTableOrderingComposer
    extends Composer<_$AppDatabase, $LinksTable> {
  $$LinksTableOrderingComposer({
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

  ColumnOrderings<String> get url => $composableBuilder(
      column: $table.url, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind => $composableBuilder(
      column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get title => $composableBuilder(
      column: $table.title, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get tagsJson => $composableBuilder(
      column: $table.tagsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get failReason => $composableBuilder(
      column: $table.failReason, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get attempts => $composableBuilder(
      column: $table.attempts, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get parentLinkId => $composableBuilder(
      column: $table.parentLinkId,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get skippedCount => $composableBuilder(
      column: $table.skippedCount,
      builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get docId => $composableBuilder(
      column: $table.docId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get addedAt => $composableBuilder(
      column: $table.addedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get processedAt => $composableBuilder(
      column: $table.processedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$LinksTableAnnotationComposer
    extends Composer<_$AppDatabase, $LinksTable> {
  $$LinksTableAnnotationComposer({
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

  GeneratedColumn<String> get url =>
      $composableBuilder(column: $table.url, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get tagsJson =>
      $composableBuilder(column: $table.tagsJson, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get failReason => $composableBuilder(
      column: $table.failReason, builder: (column) => column);

  GeneratedColumn<int> get attempts =>
      $composableBuilder(column: $table.attempts, builder: (column) => column);

  GeneratedColumn<String> get parentLinkId => $composableBuilder(
      column: $table.parentLinkId, builder: (column) => column);

  GeneratedColumn<int> get skippedCount => $composableBuilder(
      column: $table.skippedCount, builder: (column) => column);

  GeneratedColumn<String> get docId =>
      $composableBuilder(column: $table.docId, builder: (column) => column);

  GeneratedColumn<DateTime> get addedAt =>
      $composableBuilder(column: $table.addedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get processedAt => $composableBuilder(
      column: $table.processedAt, builder: (column) => column);

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$LinksTableTableManager extends RootTableManager<
    _$AppDatabase,
    $LinksTable,
    LocalLink,
    $$LinksTableFilterComposer,
    $$LinksTableOrderingComposer,
    $$LinksTableAnnotationComposer,
    $$LinksTableCreateCompanionBuilder,
    $$LinksTableUpdateCompanionBuilder,
    (LocalLink, BaseReferences<_$AppDatabase, $LinksTable, LocalLink>),
    LocalLink,
    PrefetchHooks Function()> {
  $$LinksTableTableManager(_$AppDatabase db, $LinksTable table)
      : super(TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LinksTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LinksTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LinksTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<DateTime> updatedAt = const Value.absent(),
            Value<DateTime?> baseUpdatedAt = const Value.absent(),
            Value<String?> pendingOp = const Value.absent(),
            Value<int> pushAttempts = const Value.absent(),
            Value<DateTime?> deletedAt = const Value.absent(),
            Value<String> url = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<String?> title = const Value.absent(),
            Value<String> tagsJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> failReason = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> parentLinkId = const Value.absent(),
            Value<int?> skippedCount = const Value.absent(),
            Value<String?> docId = const Value.absent(),
            Value<DateTime> addedAt = const Value.absent(),
            Value<DateTime?> processedAt = const Value.absent(),
            Value<DateTime> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) =>
              LinksCompanion(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            url: url,
            kind: kind,
            title: title,
            tagsJson: tagsJson,
            status: status,
            failReason: failReason,
            attempts: attempts,
            parentLinkId: parentLinkId,
            skippedCount: skippedCount,
            docId: docId,
            addedAt: addedAt,
            processedAt: processedAt,
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
            required String url,
            Value<String> kind = const Value.absent(),
            Value<String?> title = const Value.absent(),
            Value<String> tagsJson = const Value.absent(),
            Value<String> status = const Value.absent(),
            Value<String?> failReason = const Value.absent(),
            Value<int> attempts = const Value.absent(),
            Value<String?> parentLinkId = const Value.absent(),
            Value<int?> skippedCount = const Value.absent(),
            Value<String?> docId = const Value.absent(),
            required DateTime addedAt,
            Value<DateTime?> processedAt = const Value.absent(),
            required DateTime createdAt,
            Value<int> rowid = const Value.absent(),
          }) =>
              LinksCompanion.insert(
            id: id,
            updatedAt: updatedAt,
            baseUpdatedAt: baseUpdatedAt,
            pendingOp: pendingOp,
            pushAttempts: pushAttempts,
            deletedAt: deletedAt,
            url: url,
            kind: kind,
            title: title,
            tagsJson: tagsJson,
            status: status,
            failReason: failReason,
            attempts: attempts,
            parentLinkId: parentLinkId,
            skippedCount: skippedCount,
            docId: docId,
            addedAt: addedAt,
            processedAt: processedAt,
            createdAt: createdAt,
            rowid: rowid,
          ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ));
}

typedef $$LinksTableProcessedTableManager = ProcessedTableManager<
    _$AppDatabase,
    $LinksTable,
    LocalLink,
    $$LinksTableFilterComposer,
    $$LinksTableOrderingComposer,
    $$LinksTableAnnotationComposer,
    $$LinksTableCreateCompanionBuilder,
    $$LinksTableUpdateCompanionBuilder,
    (LocalLink, BaseReferences<_$AppDatabase, $LinksTable, LocalLink>),
    LocalLink,
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
  $$DailyPlansTableTableManager get dailyPlans =>
      $$DailyPlansTableTableManager(_db, _db.dailyPlans);
  $$CheckinsTableTableManager get checkins =>
      $$CheckinsTableTableManager(_db, _db.checkins);
  $$RhythmStateTableTableManager get rhythmState =>
      $$RhythmStateTableTableManager(_db, _db.rhythmState);
  $$ConversationsTableTableManager get conversations =>
      $$ConversationsTableTableManager(_db, _db.conversations);
  $$MessagesTableTableManager get messages =>
      $$MessagesTableTableManager(_db, _db.messages);
  $$PendingMessagesTableTableManager get pendingMessages =>
      $$PendingMessagesTableTableManager(_db, _db.pendingMessages);
  $$MeetingsTableTableManager get meetings =>
      $$MeetingsTableTableManager(_db, _db.meetings);
  $$CalendarEventsTableTableManager get calendarEvents =>
      $$CalendarEventsTableTableManager(_db, _db.calendarEvents);
  $$AthleteProfileTableTableManager get athleteProfile =>
      $$AthleteProfileTableTableManager(_db, _db.athleteProfile);
  $$ProgramsTableTableManager get programs =>
      $$ProgramsTableTableManager(_db, _db.programs);
  $$WorkoutsTableTableManager get workouts =>
      $$WorkoutsTableTableManager(_db, _db.workouts);
  $$SessionsTableTableManager get sessions =>
      $$SessionsTableTableManager(_db, _db.sessions);
  $$LinksTableTableManager get links =>
      $$LinksTableTableManager(_db, _db.links);
}
