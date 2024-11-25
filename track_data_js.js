const getSlotValue = (slotId) => message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value;
const TRACK_NUMBER = getSlotValue("rupost_track_input") ?? "";
const trackDataString = getSlotValue("track_data");
const track = trackDataString ? JSON.parse(trackDataString) : {};
const POST_STATUSES = agentSettings.POST_STATUSES;
const STATUS_CODES = agentSettings.STATUS_CODES;
const EMS_CODES = agentSettings.EMS_CODES;
const options = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};
const oneDay = 1000 * 60 * 60 * 24;
const lastAttr = track.operation_attr[track.operation_attr.length - 1];
const lastOp = track.operation_type[track.operation_type.length - 1];
const ruFederation = "Российская Федерация";
let datePlan = "";
let expireDays = 0;
let today = new Date();
let lastDay = new Date(track.operation_date[track.operation_date.length - 1]);
let dtks, indks;
const lastOperationToday = () => {
  if (today.getDate() === lastDay.getDate() && today.getMonth() === lastDay.getMonth()) {
    return 1;
  } else return 0;
};
const workDaysSinceLastStatus = () => {
  let diff = (today.getTime() - lastDay.getTime()) / oneDay;
  return Math.floor(diff);
};
const deadlinesViolated = (term_date) => {
  let result = deadlines_violated_days(term_date);
  expireDays = result;
  if (result >= 1) return 1;
  return 0;
};
const deadlines_violated_days = (term_date) => {
  if (!term_date) return 0;
  let toDate = new Date(term_date);
  let diff = Math.floor((today.getTime() - toDate.getTime()) / oneDay);
  return diff;
};
const validateObjMail = (mailTypeId = 0, mailCtgId = 0, directCtg = 0, interType = 0) => {
  if (directCtg === 2) {
    if ([0, 4].includes(interType)) return mailTypeId + "0" + mailCtgId + "2";
    else return mailTypeId + "0" + mailCtgId + "1";
  }
  return mailTypeId + "0" + mailCtgId + "0";
};
const calcKsEms = async (statusFrom) => {
  let ks = await calcKs(statusFrom);
  if (!!ks) {
    try {
      let date = new Date(+ks.substring(0, 4), +ks.substring(4, 6) - 1, +ks.substring(6, 8));
      datePlan = date + "";
      logger.info("Ks and Date: " + ks + ", " + datePlan);
      return date;
    } catch (e) {
      logger.error(`Calc ks ems error: ${e}`);
    }
  }
};
const checkDatePlan = () => {
  if (isNaN(Date.parse(datePlan))) {
    return "Не удалось посчитать дату доставки";
  }
  return new Date(datePlan).toLocaleString("ru-RU", options);
};
const indexUKD = () => {
  logger.info(`UKD`);
  return track.destination_index in agentSettings.list_for_verified;
};
const calcKs = async (statusFrom) => {
  let objectMail = validateObjMail(track.type_id, track.category_id, track.directCtg, track.interType);
  let result;
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const { from, day, time } = dateRecieve();
  if (!objectMail) {
    logger.info(`ObjectMail wrong validate`);
    return "";
  }
  try {
    let url = `https://tariff-in.russianpost.ru/delivery/v1/calculate?from=${from}&to=${
      track.destination_index
    }&object=${objectMail}&date=${day}&time=${time}&${!!track.transType ? `transtype=${track.transType}` : `isavia=0`}`;
    logger.info(`ks url: ${url}`);
    result = await axios.get(url, { httpsAgent });
    logger.info(`objectMail: ${JSON.stringify(result.data)}"}`);
    return result.data?.delivery?.deadline ?? "";
  } catch (e) {
    logger.info(e);
  }
};
const internationalIn = () => {
  logger.info(`intIn`);
  return track.country_from !== ruFederation && track.country_dest == ruFederation;
};
const internationalOut = () => {
  logger.info(`intOut`);
  return track.country_from == ruFederation && track.country_dest !== ruFederation;
};
const validTrackInCountry = () => {
  if (
    (!Number.isNaN(TRACK_NUMBER) && !TRACK_NUMBER.startsWith("0") && TRACK_NUMBER.length === 14) ||
    (TRACK_NUMBER.toLowerCase().startsWith("f103") && TRACK_NUMBER.length === 13 && !Number.isNaN(TRACK_NUMBER.slice(1, 13)))
  ) {
    return 1;
  } else return 0;
};
const validTrackOutCountry = () => {
  if (TRACK_NUMBER.length === 13 && !TRACK_NUMBER.toLowerCase().endsWith("ru") && !Number.isNaN(TRACK_NUMBER.slice(2, 11))) return 1;
  else return 0;
};
const validTrackLetter = () => {
  if (TRACK_NUMBER.toUpperCase().match("^[RCVLZ]{1}[A-Z]{1}\\d{9}[A-Z]{2}$")) return 1;
  return 0;
};
const historyIncludeOneOfStatuses = (statuses) => {
  for (let status in statuses) {
    if (track.operation_attr.includes(statuses[status]) || track.operation_type.includes(statuses[status])) return 1;
  }
  return 0;
};
const lastStatusOneOf = (statuses) => {
  for (let status of statuses) if (status.toLowerCase() === lastAttr.toLowerCase() || status.toLowerCase() === lastOp.toLowerCase()) return true;
  return false;
};
const daysFromStatus = (status) => {
  let result = track.operation_attr.lastIndexOf(status) || track.operation_type.lastIndexOf(status);
  let operationDate = new Date(track.operation_date[result]);
  let diff = (today.getTime() - operationDate.getTime()) / oneDay;
  return Math.floor(diff);
};
const workDaysFromStatusToStatus = (status1, status2) => {
  let firstIndex = track.operation_attr.lastIndexOf(status1) || track.operation_type.lastIndexOf(status1);
  let secondIndex = track.operation_attr.lastIndexOf(status2) || track.operation_type.lastIndexOf(status2);
  let firstOperationDate = new Date(track.operation_date[firstIndex]);
  let secondOperationDate = new Date(track.operation_date[secondIndex]);
  let diff = (secondOperationDate.getTime() - firstOperationDate.getTime()) / oneDay;
  return Math.floor(diff);
};
const lastStatusDate = (incDate) => {
  let date = (incDate ?? lastDay.toISOString()).split("T") ?? [];
  let data = null;
  let d = null;
  let t = null;
  if (date.length !== 0) {
    data = date[0].split("-").join(".") + ", " + date[1].slice(0, 5);
    d = date[0].split("-").join("");
    t = date[1].slice(0, 5).replace(":", "");
  }
  return { data, d, t };
};
const dateRecieve = () => {
  let fromIndex, from, date;
  fromIndex = track.operation_attr.findIndex((e) => e.includes(POST_STATUSES.ReleasedByCustoms));
  if (fromIndex < 0) fromIndex = track.operation_type.indexOf(POST_STATUSES.Reception);
  if (fromIndex > -1) from = track.operation_index[fromIndex];
  if (fromIndex > -1 && fromIndex < track.operation_date.length) date = lastStatusDate(track.operation_date[fromIndex]);
  if (fromIndex < 0) from = track.operation_index[track.operation_index.length - 1];
  if (!date) date = lastStatusDate();
  indks = from ?? "";
  dtks = date.data ?? "";
  logger.info(`fi:${fromIndex},f:${from},d:${JSON.stringify(date)}`);
  return { from, day: date?.d, time: date?.t };
};
const emsCheck = () => {
  return TRACK_NUMBER.toUpperCase()[0] === "E" || track.ptype === "Отправление EMS" || TRACK_NUMBER.toUpperCase().match("SL\\d{9}RU");
};
const hasHistory = () => {
  return track.operation_attr.length > 0 ? 1 : 0;
};
const simplePackage = () => {
  return TRACK_NUMBER.toUpperCase().match("U[A-Z]\\d{9}[A-Z][A-Z]");
};
const hasFullHistory = () => {
  return track.destination_index ? 1 : 0;
};
const internal = () => {
  logger.info(`internal`);
  return track.country_from === track.country_dest && track.country_from === ruFederation;
};
const historyIncludeOneOfStatusesByMatch = (patterns) => {
  let result = false;
  for (let pattern of patterns) {
    for (let operationAttr of track.operation_attr) if (operationAttr.toLowerCase() === pattern.toLowerCase()) result = true;
    for (let operationType of track.operation_type) if (operationType.toLowerCase() === pattern.toLowerCase()) result = true;
  }
  return result;
};
const ksPresent = (termDate) => !!termDate;
const daysDiff = (firstDate, secondDate) => {
  logger.info(`daysDiff`);
  const firstTimeStamp = new Date(firstDate).getTime();
  const secondTimeStamp = new Date(secondDate).getTime();
  return Math.ceil(Math.abs(secondTimeStamp - firstTimeStamp) / oneDay);
};
const findStatusDate = (status) => {
  logger.info(`findStatusDate`);
  for (let i = 0; i < track.operation_attr.length; i++) {
    if (track.operation_attr[i].toLowerCase() === status.toLowerCase() || track.operation_type[i].toLowerCase() === status.toLowerCase()) {
      return new Date(track.operation_date[i]);
    }
  }
  return null;
};
const deadlinesViolatedDays = (termDate) => {
  logger.info(`deadlinesViolatedDays`);
  if (!termDate) return 0;
  let result;
  const diffBetweenDays = daysDiff(today, termDate);
  result = diffBetweenDays;
  if (lastStatusOneOf([POST_STATUSES.Awarding])) {
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.InPlaceOfDelivery])) {
      result = diffBetweenDays - daysFromStatus(POST_STATUSES.InPlaceOfDelivery);
    } else {
      result = diffBetweenDays - daysFromStatus(POST_STATUSES.Awarding);
    }
  }
  if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery])) {
    result = diffBetweenDays - daysFromStatus(POST_STATUSES.InPlaceOfDelivery);
  }
  return result;
};
const typeIs = (ptype) => {
  return track.ptype.toLowerCase() === ptype.toLowerCase();
};
const typeOneOf = (types) => {
  for (let type of types) {
    if (typeIs(type)) return true;
  }
  return false;
};
const departingToRf = () => {
  logger.info(`departingToRf`);
  return track.country_from !== ruFederation && track.country_dest === ruFederation;
};
const daysFromStatusToStatus = (fromStatus, toStatus) => {
  const fromStatusDays = findStatusDate(fromStatus);
  const toStatusDays = findStatusDate(toStatus);
  if (!fromStatusDays || !toStatusDays) return 0;
  return daysDiff(new Date(fromStatusDays), new Date(toStatusDays));
};
const emsVBranch = () => {
  logger.info(`emsVBranch`);
  if (
    (daysFromStatus(POST_STATUSES.InPlaceOfDelivery) && daysFromStatus(POST_STATUSES.InPlaceOfDelivery) >= 15) ||
    (daysFromStatus(POST_STATUSES.AwaitingCourierDelivery2) && daysFromStatus(POST_STATUSES.AwaitingCourierDelivery2) >= 15)
  ) {
    return EMS_CODES.V1;
  }
  if (
    lastStatusOneOf([
      POST_STATUSES.ProhibitedBySAB,
      POST_STATUSES.SenderStatement,
      POST_STATUSES.OtherCircumstances,
      POST_STATUSES.UnableToReadAddress,
      POST_STATUSES.InconsistencyOfCompleteness,
      POST_STATUSES.RejectionByAddressee,
      POST_STATUSES.RefusalOfReleaseByCustoms,
      POST_STATUSES.NoAddresseeAtSpecifiedAddress,
    ])
  ) {
    return EMS_CODES.G10;
  }
  return EMS_CODES.G9;
};
const emsNpvBranch = () => {
  logger.info(`emsNpvBranch`);
  if (
    historyIncludeOneOfStatuses([
      POST_STATUSES.AddresseePickUpShipmentHimself,
      POST_STATUSES.AddresseeNotAvailable,
      POST_STATUSES.AddresseeRefusedShipment,
      POST_STATUSES.AddresseeMoved,
      POST_STATUSES.PendingPaymentOfFee,
      POST_STATUSES.TemporaryAbsenceOfAddressee,
      POST_STATUSES.DeliveryPostponedAtRequestOfAddressee,
      POST_STATUSES.ZasylShipment,
      POST_STATUSES.Other,
      POST_STATUSES.UnableToContactCustomer,
      POST_STATUSES.IncompleteInsufficientIncorrectDocuments,
      POST_STATUSES.IncompleteAddress,
      POST_STATUSES.IncorrectUnreadableIncompleteAddress,
      POST_STATUSES.UnfortunateDelivery,
      POST_STATUSES.ForceMajeureUnforeseenCircumstances,
      POST_STATUSES.NoHomeDeliveryRF,
      POST_STATUSES.NoHomeDeliveryOverseasShipments,
      POST_STATUSES.AtRequestOfSender,
      POST_STATUSES.AddresseeHasPostBox,
      POST_STATUSES.NotMeetCustomsRequirements,
      POST_STATUSES.ExpiredStorageLifeInPostBox,
    ])
  ) {
    return EMS_CODES.G10;
  }
  return EMS_CODES.G9;
};
const emsMishBranch = () => {
  logger.info(`emsMishBranch`);
  if (historyIncludeOneOfStatuses([POST_STATUSES.Export]) || historyIncludeOneOfStatuses([POST_STATUSES.ExportInternationalMail]))
    return EMS_CODES.G10;
  if (historyIncludeOneOfStatuses([POST_STATUSES.LeftPlaceOfInternationalExchange])) return EMS_CODES.G10;
  if (historyIncludeOneOfStatuses([POST_STATUSES.ReleasedByCustoms]) || historyIncludeOneOfStatuses([POST_STATUSES.ReleasedByCustomsFundReserved]))
    return EMS_CODES.G10;
  if (workDaysFromStatusToStatus(POST_STATUSES.CustomsAcceptance, POST_STATUSES.CustomsRelease) > 10) return EMS_CODES.MISH3;
  return EMS_CODES.MISH2;
};
const emsNksBranch = () => {
  logger.info(`emsNksBranch`);
  if (
    lastStatusOneOf([
      POST_STATUSES.InPlaceOfDelivery,
      POST_STATUSES.AwaitingCourierDelivery,
      POST_STATUSES.HandedToCourier,
      POST_STATUSES.HandedToCourierDriver,
      POST_STATUSES.FailedAttemptedDelivery,
    ])
  ) {
    if (indexUKD()) return EMS_CODES.G9;
    if (daysFromStatus(POST_STATUSES.InPlaceOfDelivery) > 2) return EMS_CODES.G9;
    return EMS_CODES.NNKS1;
  }
  if (historyIncludeOneOfStatuses([POST_STATUSES.Zasylka])) return EMS_CODES.G9;
  if (historyIncludeOneOfStatuses([POST_STATUSES.Refund])) return emsVBranch();
  if (historyIncludeOneOfStatuses([POST_STATUSES.Awarded])) return EMS_CODES.G10;
  return EMS_CODES.G9;
};
const emsNnksBranch = () => {
  logger.info(`emsNnksBranch`);
  if (
    lastStatusOneOf([
      POST_STATUSES.AwaitingCourierDelivery,
      POST_STATUSES.InPlaceOfDelivery,
      POST_STATUSES.StorageLifeExpires,
      POST_STATUSES.PrescribedStorageLife,
    ])
  ) {
    if (indexUKD()) return EMS_CODES.G9;
    if (daysFromStatus(POST_STATUSES.InPlaceOfDelivery) > 2) return EMS_CODES.G9;
    return EMS_CODES.NNKS1;
  }
  if (historyIncludeOneOfStatuses([POST_STATUSES.Refund])) return emsVBranch();
  if (historyIncludeOneOfStatuses([POST_STATUSES.TemporaryStorage, POST_STATUSES.PutIntoTemporaryStorage, POST_STATUSES.TransferToTemporaryStorage]))
    return EMS_CODES.NNKS2;
  return EMS_CODES.G10;
};
const emsMvhBranch = async () => {
  logger.info(`emsMvhBranch`);
  if (!historyIncludeOneOfStatuses([POST_STATUSES.ArrivedInRF])) return EMS_CODES.MVH5;
  if (historyIncludeOneOfStatuses([POST_STATUSES.SentWithCustomsNotification])) return EMS_CODES.MVH1;
  if (historyIncludeOneOfStatuses([POST_STATUSES.SentWithObligatoryPayment])) return EMS_CODES.MVH2;
  if (historyIncludeOneOfStatuses([POST_STATUSES.ReleasedByCustoms]) || historyIncludeOneOfStatuses([POST_STATUSES.ReleasedByCustomsFundReserved])) {
    if (historyIncludeOneOfStatuses([POST_STATUSES.LeftPlaceOfInternationalExchange])) {
      let result = await calcKsEms(POST_STATUSES.LeftPlaceOfInternationalExchange);
      if (deadlinesViolated(result)) return emsNksBranch();
      return emsNnksBranch();
    }
    return EMS_CODES.MVH6;
  }
  if (lastStatusOneOf([POST_STATUSES.CustomsAcceptance])) {
    if (workDaysSinceLastStatus() > 10) return EMS_CODES.MVH3;
    return EMS_CODES.MVH4;
  }
  return EMS_CODES.G10;
};
const emsBranch = async () => {
  logger.info(`emsBranch`);
  if (!hasHistory()) {
    if (TRACK_NUMBER.toUpperCase().endsWith("RU")) return EMS_CODES.G11;
    return EMS_CODES.G4;
  }
  if (historyIncludeOneOfStatuses([POST_STATUSES.Awarding])) return EMS_CODES.G10;
  if (historyIncludeOneOfStatuses([POST_STATUSES.Refund])) return emsVBranch();
  if (historyIncludeOneOfStatuses([POST_STATUSES.HandedToCourier, POST_STATUSES.HandedToCourierDriver])) {
    if (lastOperationToday()) return EMS_CODES.PK1;
    return EMS_CODES.G9;
  }
  if (historyIncludeOneOfStatuses([POST_STATUSES.FailedAttemptedDelivery])) return emsNpvBranch();
  if (internationalIn()) return await emsMvhBranch();
  if (internationalOut()) return emsMishBranch();
  let result = await calcKsEms(POST_STATUSES.Reception);
  if (deadlinesViolated(result)) return emsNksBranch();
  return emsNnksBranch();
};
const mvhBranchZ = () => {
  logger.info(`mvhBranchZ`);
  if (lastStatusOneOf([POST_STATUSES.Reception])) return STATUS_CODES.SimpleShipmentWithoutTracking;
  if (
    lastStatusOneOf([POST_STATUSES.Export]) ||
    (lastStatusOneOf([POST_STATUSES.ExportInternationalMail]) && !lastStatusOneOf([POST_STATUSES.Awarding]))
  )
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  return STATUS_CODES.ProcessingInCountryOfDispatch;
};
const v_branch = () => {
  logger.info(`v_branch`);
  if (departingToRf() || internal() || validTrackInCountry()) {
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.InPlaceOfDelivery])) {
      if (["посылка", "еком", "курьер онлайн"].includes(track.ptype.toLowerCase().trim())) {
        if (daysFromStatusToStatus(POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.Refund) > 30)
          return STATUS_CODES.UnclaimedByRecipientReturnShipment;
        if (
          historyIncludeOneOfStatusesByMatch([
            POST_STATUSES.OtherCircumstances,
            POST_STATUSES.WrongAddress,
            POST_STATUSES.NoAddresseeAtSpecifiedAddress,
            POST_STATUSES.RejectionByAddressee,
            POST_STATUSES.AddresseeNotListed,
            POST_STATUSES.SenderStatement,
          ])
        )
          return STATUS_CODES.ReturnShipmentWithReason;
        return STATUS_CODES.ReturnShipmentBeforeDeadline;
      }
      if (daysFromStatusToStatus(POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.Refund) > 15) return STATUS_CODES.UnclaimedByRecipientReturnShipment;
      if (
        historyIncludeOneOfStatusesByMatch([
          POST_STATUSES.OtherCircumstances,
          POST_STATUSES.WrongAddress,
          POST_STATUSES.NoAddresseeAtSpecifiedAddress,
          POST_STATUSES.RejectionByAddressee,
          POST_STATUSES.AddresseeNotListed,
          POST_STATUSES.SenderStatement,
        ])
      )
        return STATUS_CODES.ReturnShipmentWithReason;
      return STATUS_CODES.ReturnShipmentBeforeDeadline;
    }
    if (
      historyIncludeOneOfStatusesByMatch([
        POST_STATUSES.StorageTimeExpired,
        POST_STATUSES.OtherCircumstances,
        POST_STATUSES.WrongAddress,
        POST_STATUSES.NoAddresseeAtSpecifiedAddress,
        POST_STATUSES.RejectionByAddressee,
        POST_STATUSES.AddresseeNotListed,
        POST_STATUSES.SenderStatement,
      ])
    ) {
      return STATUS_CODES.ReturnShipmentWithReason;
    }
    return STATUS_CODES.RejectByCustomsAdvanced;
  }
  if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.LeftPlaceOfInternationalExchange])) return STATUS_CODES.RejectByCustoms;
  return STATUS_CODES.RejectByCustomsAdvanced;
};
const nsv_branch = () => {
  logger.info(`nsv_branch`);
  const typeArray = ["трек-открытка", "трек-письмо", "трек-отправление"];
  if (typeIs("Бандероль комплект")) return STATUS_CODES.WithRupostPreDeliveryExpired;
  if (typeIs("ЕКОМ")) {
    if (
      lastStatusOneOf([
        POST_STATUSES.AssigningIdentifier,
        POST_STATUSES.StorageLifeExpires,
        POST_STATUSES.StorageTimeExpired,
        POST_STATUSES.InPlaceOfDelivery,
      ])
    )
      return STATUS_CODES.InPostofficeWithPassport;
    if (lastStatusOneOf([POST_STATUSES.Awarded])) return STATUS_CODES.RedirectToIntentLatestStatuses2;
    else return STATUS_CODES.DateAndAttribute;
  }
  if (
    lastStatusOneOf([
      POST_STATUSES.InPlaceOfDelivery,
      POST_STATUSES.AwaitingCourierDelivery,
      POST_STATUSES.Awarding,
      POST_STATUSES.HandedToMailman,
      POST_STATUSES.HandedToCourierDriver,
      POST_STATUSES.FailedAttemptedDelivery,
      POST_STATUSES.Reserved,
      POST_STATUSES.DeliveredToMailbox,
      POST_STATUSES.AssigningIdentifier,
    ])
  ) {
    if (typeIs("Курьер онлайн")) {
      if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.AwaitingCourierDelivery])) return STATUS_CODES.InPostofficeWithDelivery2;
      if (lastStatusOneOf([POST_STATUSES.FailedAttemptedDelivery])) {
        return STATUS_CODES.TryToHandOver;
      } else {
        return STATUS_CODES.RedirectToIntentLatestStatuses2;
      }
    }
    if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.ProcessingInPlaceOfDelivery])) {
      if (typeIs('"Посылка Курьер EMS"')) return STATUS_CODES.InPostofficeWithDelivery;
      return STATUS_CODES.InPostofficeWithPassport;
    }
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  }
  if (lastStatusOneOf([POST_STATUSES.TemporaryStorageUnreleased, POST_STATUSES.TemporaryStorageUnclaimed, POST_STATUSES.TransferToTemporaryStorage]))
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Zasylka])) {
    if (deadlinesViolatedDays(datePlan) > 3) {
      if (TRACK_NUMBER.toLowerCase().startsWith("z") || typeOneOf(typeArray)) return STATUS_CODES.CorrectAddressWithRecomendation;
      return STATUS_CODES.SentToPostofficeWithTracing;
    }
    if (TRACK_NUMBER.toLowerCase().startsWith("z") || typeOneOf(typeArray)) return STATUS_CODES.SentToPostofficeWithDate2;
    return STATUS_CODES.SentToPostofficeWithDate;
  }
  if (deadlinesViolatedDays(datePlan) > 3) {
    if (TRACK_NUMBER.toLowerCase().startsWith("z") || typeOneOf(typeArray)) return STATUS_CODES.RedirectToIntentLatestStatusesWithRecomendation;
    return STATUS_CODES.PresumablyInPostofficeWithTracing;
  }
  if (TRACK_NUMBER.toLowerCase().startsWith("z") || typeOneOf(typeArray)) return STATUS_CODES.OnWayToPostofficeWithDate;
  return STATUS_CODES.OnWayToRecipient;
};
const nnsv_branch = () => {
  logger.info(`nnsv_branch`);
  if (typeIs("ЕКОМ")) {
    if (
      lastStatusOneOf([
        POST_STATUSES.AssigningIdentifier,
        POST_STATUSES.StorageLifeExpires,
        POST_STATUSES.StorageTimeExpired,
        POST_STATUSES.InPlaceOfDelivery,
      ])
    )
      return STATUS_CODES.InPostofficeWithPassport;
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  }
  if (
    lastStatusOneOf([
      POST_STATUSES.InPlaceOfDelivery,
      POST_STATUSES.HandedToCourierDriver,
      POST_STATUSES.AwaitingCourierDelivery,
      POST_STATUSES.HandedToMailman,
      POST_STATUSES.FailedAttemptedDelivery,
      POST_STATUSES.Awarding,
      POST_STATUSES.DeliveredToMailbox,
      POST_STATUSES.Reserved,
      POST_STATUSES.AssigningIdentifier,
    ])
  ) {
    if (typeIs("Курьер онлайн")) {
      if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.AwaitingCourierDelivery])) return STATUS_CODES.InPostofficeWithDelivery2;
      if (lastStatusOneOf([POST_STATUSES.FailedAttemptedDelivery])) return STATUS_CODES.TryToHandOver;
      return STATUS_CODES.RedirectToIntentLatestStatuses2;
    }
    if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.ProcessingInPlaceOfDelivery])) return STATUS_CODES.InPostofficeWithPassport;
    if (typeIs("Посылка Курьер EMS")) return STATUS_CODES.InPostofficeWithDelivery;
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  }
  if (lastStatusOneOf([POST_STATUSES.TemporaryStorageUnreleased, POST_STATUSES.TemporaryStorageUnclaimed, POST_STATUSES.TransferToTemporaryStorage]))
    return STATUS_CODES.RedirectToIntentLatestStatuses2;
  if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Zasylka])) {
    if (track.weight > 20000) return STATUS_CODES.onWayToPostofficeWith20kg;
    return STATUS_CODES.OnWayToPostoffice;
  }
  if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Refund])) {
    if (["посылка", "еком", "курьер онлайн"].includes(track.ptype.toLowerCase().trim())) {
      if (track.rank === "Судебное" || track.rank === "Административное") {
        if (daysFromStatusToStatus(POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.Refund) > 7) return STATUS_CODES.UnclaimedReturnShipment;
        return STATUS_CODES.ReturnShipmentBeforeDeadline;
      }
    }
    if (daysFromStatusToStatus(POST_STATUSES.InPlaceOfDelivery, POST_STATUSES.Refund) > 15) return STATUS_CODES.UnclaimedReturnShipment;
    return STATUS_CODES.ReturnShipmentBeforeDeadline;
  }
  if (daysDiff(track.operation_date[track.operation_date.length - 1], today.getTime()) > 5) return STATUS_CODES.RedirectToIntentLatestStatuses3;
  return STATUS_CODES.RedirectToIntentLatestStatuses2;
};
const mvh_branch = async () => {
  logger.info(`mvh_branch`);
  if (departingToRf()) {
    if (
      historyIncludeOneOfStatusesByMatch([
        POST_STATUSES.LeftPlaceOfInternationalExchange,
        POST_STATUSES.ReleasedByCustoms,
        POST_STATUSES.ReleasedByCustomsFundReserved,
      ])
    ) {
      let result;
      if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.LeftPlaceOfInternationalExchange])) {
        result = await calcKsEms();
      } else if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.ReleasedByCustoms, POST_STATUSES.ReleasedByCustomsFundReserved]))
        return STATUS_CODES.RedirectToIntentLatestStatuses;
      if (result && deadlinesViolated(result)) return nsv_branch();
      return nnsv_branch();
    }
    if (lastStatusOneOf([POST_STATUSES.CustomsAcceptance])) {
      await calcKsEms();
      if (workDaysSinceLastStatus() > 10) return STATUS_CODES.OnCustomsControlPeriodExtendedAdvanced;
      return STATUS_CODES.OnCustomsControlAdvanced;
    }
    if (lastStatusOneOf([POST_STATUSES.ArrivedAtMMPO])) {
      if (workDaysSinceLastStatus() <= 3) return STATUS_CODES.PreparingHandedToCustoms;
      if (workDaysSinceLastStatus() > 6) return STATUS_CODES.PreparingHandedToCustomsAdvanced;
      return STATUS_CODES.PreparingHandedToCustoms;
    }
    if (lastStatusOneOf([POST_STATUSES.ReleasedByCustoms, POST_STATUSES.ReleasedByCustomsFundReserved]))
      return STATUS_CODES.RedirectToIntentLatestStatuses;
    if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery])) return STATUS_CODES.RedirectToIntentLatestStatuses2;
    if (lastStatusOneOf([POST_STATUSES.Awarding])) return STATUS_CODES.RedirectToIntentLatestStatuses;
  }
  if (lastStatusOneOf([POST_STATUSES.Export])) return STATUS_CODES.RedirectToIntentLatestStatuses2;
  return STATUS_CODES.ProcessingInCountryOfDispatch;
};
const historyIncludeOneOfStatusesDoubly = (status) => {
  const doubleAttr = track.operation_attr.filter((el) => el.toLowerCase() === status.toLowerCase());
  const doubleTypes = track.operation_type.filter((el) => el.toLowerCase() === status.toLowerCase());
  return doubleAttr.length >= 2 && doubleTypes.length >= 2;
};
const mish_branch = async () => {
  logger.info(`mish_branch`);
  if (
    historyIncludeOneOfStatusesByMatch([
      POST_STATUSES.CustomsAcceptance,
      POST_STATUSES.ArrivedPlaceOfInternationalExchange,
      POST_STATUSES.ReleasedByCustoms,
      POST_STATUSES.ExportInternationalMail,
      POST_STATUSES.ArrivedAtMMPO,
      POST_STATUSES.LeftPlaceOfInternationalExchange,
      POST_STATUSES.ReleasedByCustomsFundReserved,
    ])
  ) {
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.CustomsAcceptance]) && !lastStatusOneOf([POST_STATUSES.CustomsAcceptance]))
      await calcKsEms();
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.ExportInternationalMail]) && !lastStatusOneOf([POST_STATUSES.ExportInternationalMail])) {
      if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Refund])) return v_branch();
      if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.FailedAttemptedDelivery])) return STATUS_CODES.CouldntHandOverInCountyArrival;
      return STATUS_CODES.LeftRussiaAndHeadingToCountry;
    }
    if (lastStatusOneOf([POST_STATUSES.CustomsAcceptance])) {
      await calcKsEms();
      if (workDaysSinceLastStatus() > 10) return STATUS_CODES.OnCustomsControlPeriodExtended;
      return STATUS_CODES.OnCustomsControl;
    }
    if (lastStatusOneOf([POST_STATUSES.ArrivedAtMMPO, POST_STATUSES.ArrivedPlaceOfInternationalExchange])) {
      if (workDaysSinceLastStatus() > 3) {
        if (workDaysSinceLastStatus() <= 6) {
          return STATUS_CODES.AtCustomsGettingReadyToHandedCounty;
        }
        return STATUS_CODES.AtCustomsGettingReadyToExport;
      }
      return STATUS_CODES.CustomsPreparing;
    }
    if (lastStatusOneOf([POST_STATUSES.ExportInternationalMail])) {
      if (historyIncludeOneOfStatusesDoubly(POST_STATUSES.ExportInternationalMail)) return STATUS_CODES.ManyExportsAttempts;
      return STATUS_CODES.LeftRussiaAndHeadingToCountryAdvanced;
    }
    if (
      lastStatusOneOf([POST_STATUSES.ReleasedByCustoms, POST_STATUSES.LeftPlaceOfInternationalExchange, POST_STATUSES.ReleasedByCustomsFundReserved])
    ) {
      if (workDaysSinceLastStatus() > 3) return STATUS_CODES.PassedСustomsСontrol;
      else return STATUS_CODES.PassedСustomsСontrolExtended;
    }
    return STATUS_CODES.LeftRussiaAndHeadingToCountry;
  }
  return STATUS_CODES.ShipmentInStatus;
};
const symbolCodeChoose = async () => {
  if (emsCheck()) return await emsBranch();
  if (simplePackage()) {
    if (lastStatusOneOf([POST_STATUSES.InPlaceOfDelivery])) return STATUS_CODES.UnknownArticle;
    return STATUS_CODES.WithoutRegistration;
  }
  if (!hasHistory()) {
    if (validTrackInCountry()) return STATUS_CODES.WaitingUpdateInSystem;
    if (validTrackOutCountry()) {
      if (!validTrackLetter()) return STATUS_CODES.IsItTrackNumber;
      else return STATUS_CODES.ShipmentAbsentInSystem;
    }
    return STATUS_CODES.IsItTrackNumber;
  }
  if (!hasFullHistory()) {
    if (!validTrackOutCountry()) return await mish_branch();
    if (validTrackOutCountry() && TRACK_NUMBER[0].toUpperCase() === "Z") return mvhBranchZ();
    return STATUS_CODES.RedirectToIntentLatestStatuses;
  }
  if (lastStatusOneOf([POST_STATUSES.AssigningIdentifier])) return STATUS_CODES.RedirectToIntentLatestStatuses2;
  if (internal() || validTrackInCountry()) {
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Refund])) return v_branch();
    const result = await calcKsEms();
    if (ksPresent(result)) {
      if (deadlinesViolated(result)) return nsv_branch();
      else return nnsv_branch();
    } else {
      if (typeIs("ЕКОМ") || typeIs("ЕКОМ Маркетплейс")) {
        if (
          lastStatusOneOf([
            POST_STATUSES.InPlaceOfDelivery,
            POST_STATUSES.AssigningIdentifier,
            POST_STATUSES.StorageLifeExpires,
            POST_STATUSES.StorageTimeExpired,
          ])
        )
          return STATUS_CODES.InPostofficeWithPassport;
        if (lastStatusOneOf([POST_STATUSES.Awarded])) return STATUS_CODES.RedirectToIntentLatestStatuses2;
        else return STATUS_CODES.WithRupostPre;
      } else return STATUS_CODES.WithRupostPre;
    }
  } else {
    if (historyIncludeOneOfStatusesByMatch([POST_STATUSES.Refund, POST_STATUSES.Rejection])) return v_branch();
    if (departingToRf()) return await mvh_branch();
    else return await mish_branch();
  }
};
const main = async () => {
  logger.info(`Choosing code for: ${TRACK_NUMBER}`);
  const res = await symbolCodeChoose();
  logger.info(`symbolCodeChoosen: ${res}`);
  const slots = {
    rupost_track_ok: `${res}`,
    rupost_tracking_operation: `${lastOp}`,
    rupost_adress: `${track.destination_address}`,
    rupost_index_delivery: `${track.destination_index}`,
    rupost_tracking_type: `${track.ptype}`,
    rupost_date_last: lastDay?.toLocaleString("ru-RU", options) ?? "",
    rupost_attribute: lastAttr !== "noData" ? lastAttr : lastOp,
    rupost_date_plan: checkDatePlan(),
    rupost_cs_date: dtks,
    rupost_cs_index: indks,
    rupost_expire_flag: `${expireDays > 2 ? "expire" : "fresh"}`,
    rupost_country_arrival: `${track.country_dest}`,
    rupost_date_now_plus: `${new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2).toLocaleString("ru-RU", options)}`,
    rupost_operation_today: `${lastOperationToday() ? "TODAY" : ""}`,
    rupost_date_fail: `${
      historyIncludeOneOfStatuses([POST_STATUSES.FailedAttemptedDelivery])
        ? findStatusDate(POST_STATUSES.FailedAttemptedDelivery).toLocaleString("ru-RU", options)
        : ""
    }`,
    rupost_date_zasylka: `${
      historyIncludeOneOfStatuses([POST_STATUSES.Zasylka]) ? findStatusDate(POST_STATUSES.Zasylka).toLocaleString("ru-RU", options) : ""
    }`,
    rupost_atrribute_return: `${
      historyIncludeOneOfStatuses([POST_STATUSES.Refund]) ? track.operation_attr[track.operation_type.indexOf(POST_STATUSES.Refund)] : ""
    }`,
  };
  logger.info(`Track data slots: ${JSON.stringify(slots)}`);
  return [
    agentApi.makeTextReply(`/switchredirect aiassist2 intent_id="${agentSettings.redirectTo}"`, undefined, undefined, {
      ...JSON.parse(JSON.stringify(slots)),
    }),
  ];
};
try {
  resolve(main());
} catch (e) {
  resolve(agentApi.makeTextReply("При выполнении запроса по трек номеру произошла ошибка"));
}