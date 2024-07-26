import admin from "firebase-admin";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import config from "../config.json";

export const getDoc = async (docPath: string): Promise<DocumentSnapshot<DocumentData>> => {
  const docRef = admin.firestore().doc(docPath);
  const docSnapshot = await docRef.get();
  if (docSnapshot.exists) {
    return docSnapshot;
  } else {
    throw new Error('The document ' + docPath + ' does not exist');
  }
}

export const getStripeCustomerId = (userId: string, name: string, email: string, paymentMethodId: string, billingDetails: any) => {
  const stripe = require('stripe')(config.stripe.secret_api_key);
  let user: any = null;
  let stripeCustomerId = '';
  return getDoc('users/' + userId).then(userDoc => {
    user = userDoc;
    let data: any = {
      name: name,
      email: email
    }
    if (billingDetails) {
      data.address = {
        line1: billingDetails.address.line1,
        line2: billingDetails.address.line2,
        city: billingDetails.address.city,
        postal_code: billingDetails.address.postal_code,
        state: billingDetails.address.state,
        country: billingDetails.address.country
      }
      data.description = "Contact: " + data.name;
      data.metadata = {
        contact_name: data.name,
        firebase_uid: userId
      }
      data.name = billingDetails.name; // business name replaces user name
    }
    if (userDoc!.data()?.stripeCustomerId) {
      // update stripe customer
      return stripe.customers.update(userDoc!.data()?.stripeCustomerId, data);
    } else {
      // create stripe customer
      if (paymentMethodId) {
        data.payment_method = paymentMethodId
      }
      return stripe.customers.create(data);
    }
  }).then(customer => {
    stripeCustomerId = customer.id;
    let updateUserData: any = {
      stripeCustomerId: customer.id
    }
    if (billingDetails) {
      updateUserData.billingDetails = billingDetails
    }
    return user.ref.set(updateUserData, { merge: true });
  }).then(res => {
    if (paymentMethodId) {
      return stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });
    } else {
      return {
        customer: stripeCustomerId
      }
    }
  }).then(res => {
    return stripeCustomerId;
  });
}

export const addUserToSubscription = async (subscriptionId: string, userId: string, permissions: string[]) => {
  const [subscription] = await Promise.all([getDoc('subscriptions/' + subscriptionId), getDoc('users/' + userId)]);
  let subPermissions: any = {}; // init permissiones for the subscription
  if (typeof (subscription.data()?.permissions) !== 'undefined') {
    subPermissions = subscription.data()?.permissions;
  }
  for (let i = 0; i < permissions.length; i++) {
    if (typeof (subPermissions[permissions[i]]) !== 'undefined') {
      if (subPermissions[permissions[i]].indexOf(userId) === -1) {
        // the permission level exists and push the user ID to the permission level
        subPermissions[permissions[i]].push(userId);
      }
    } else {
      subPermissions[permissions[i]] = [];
      subPermissions[permissions[i]].push(userId);
    }
  }
  await subscription.ref.set({
    permissions: subPermissions
  }, { merge: true });
  return { 'result': 'success', 'subscriptionId': subscriptionId };
}

export const getDefaultPermission = () => {
  let permission = "";
  for (let p in config.permissions) {
    //@ts-ignore
    if (config.permissions[p].default) {
      permission = p;
      break;
    }
  }
  return permission;
}

export const getAdminPermission = () => {
  let permission = "";
  for (let p in config.permissions) {
    //@ts-ignore
    if (config.permissions[p].admin) {
      permission = p;
      break;
    }
  }
  return permission;
}

export const getPermissions = (permissions: any, userId: string) => {
  const grantedPermissions: any[] = [];
  for (let p in permissions) {
    if (permissions[p].indexOf(userId) !== -1) {
      grantedPermissions.push(p);
    }
  }
  return grantedPermissions;
}

export const getUserByEmail = async (email: string) => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user;
  } catch (error) {
    return null;
  }
}

export const updateInvoice = (invoiceObject: any) => {
  return admin.firestore().collection('subscriptions').where('stripeSubscriptionId', '==', invoiceObject.subscription).get().then(snapshot => {
    if (snapshot.empty) {
      throw Error("No subscription is associated with the Stripe subscription ID: " + invoiceObject.subscription);
    } else {
      let actions: any[] = [];
      snapshot.forEach(subscription => {
        actions.push(
          subscription.ref.collection('invoices').doc(invoiceObject.id).set({
            'id': invoiceObject.id,
            'total': invoiceObject.total,
            'subTotal': invoiceObject.subtotal,
            'amountDue': invoiceObject.amount_due,
            'amountPaid': invoiceObject.amount_paid,
            'tax': invoiceObject.tax,
            'currency': invoiceObject.currency,
            'created': invoiceObject.created,
            'status': invoiceObject.status,
            'hostedInvoiceUrl': invoiceObject.hosted_invoice_url
          }, { merge: true })
        );
      });
      return Promise.all(actions);
    }
  }).then(writeResult => {
    return true;
  }).catch(err => {
    throw err;
  })
}

export const updateSubscription = (subscriptionObject: any) => {
  return admin.firestore().collection('subscriptions').where('stripeSubscriptionId', '==', subscriptionObject.id).get().then(snapshot => {
    if (snapshot.empty) {
      throw Error("No subscription is associated with the Stripe subscription ID: " + subscriptionObject.id);
    } else {
      let actions: any[] = [];
      snapshot.forEach(subscription => {
        actions.push(
          subscription.ref.set({
            subscriptionStatus: subscriptionObject.status,
            paymentMethod: subscriptionObject.default_payment_method,
            subscriptionCreated: subscriptionObject.created,
            subscriptionCurrentPeriodStart: subscriptionObject.current_period_start,
            subscriptionCurrentPeriodEnd: subscriptionObject.current_period_end,
            subscriptionEnded: subscriptionObject.ended || 0
          }, { merge: true })
        );
      });
      return Promise.all(actions);
    }
  }).then(writeResult => {
    return true;
  }).catch(err => {
    throw err;
  })
};

