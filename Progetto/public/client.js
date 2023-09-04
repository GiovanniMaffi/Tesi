import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/firestore'

// Firebase App settings used for the signaling part.
const firebaseConfig = {
    apiKey: "AIzaSyA05qKwQr30mtH-N5dC6UM9OELw9X6GWEo",
    authDomain: "provavideochiamata2.firebaseapp.com",
    projectId: "provavideochiamata2",
    storageBucket: "provavideochiamata2.appspot.com",
    messagingSenderId: "768267000742",
    appId: "1:768267000742:web:5a4efd29d29c4aecef8d67"
};
  
firebase.initializeApp(firebaseConfig)

const firestore = firebase.firestore();

// Stun servers required for ICE to function.
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

let pc;
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton')
const webcamVideo = document.getElementById('webcamVideo')
const remoteVideo = document.getElementById('remoteVideo')
const WebcamDisableButton = document.getElementById("webcamButtonStop")
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
WebcamDisableButton.disabled = true;
answerButton.disabled = true;

// 1) Setup media sources.

webcamButton.onclick = async () => {
  pc = new RTCPeerConnection(servers);

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }) // Request for access to user stream.
  remoteStream = new MediaStream()

  // Adds the video/audio tracks from the local stream to the peer connection.
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream)
  }); 

  // Fills the remote (empty) stream with traces obtained with the ontrack property of RTCPeerConnection.
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track)
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // Disable/enable buttons.
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true
  WebcamDisableButton.disabled = false;
  answerButton.disabled = false;
};

// 1.5) Disable media sources.
WebcamDisableButton.onclick = async () => {
  // Stop every track of the stream. This disables the webcam.
  localStream.getTracks().forEach(function(track) {
    track.stop();
  });
  webcamVideo.srcObject = localStream;
  
  // Disable/enable buttons
  webcamButton.disabled = false;
  WebcamDisableButton.disabled = true;
  callButton.disabled = true;
  answerButton.disabled = true;
}

// 2) Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc(); // Manage the answer and offer from both users.
  
  // Collection of all candidates for each user
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id; // Random ID (created by Firestore) that will be used for join the call

  // Get candidates for caller, writing them in the 'offerCandidates' collection 
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);  

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer }); // Write all the SDP information of the caller to the DB

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => { // OnSnapshot notifies the user whenever a change is made to the document in the DB
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => { 
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3) Answer the call with the unique ID.
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  // Get candidates for called, writing them in the 'answerCandidates' collection 
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  // Get the offer from the DB
  const callData = (await callDoc.get()).data();
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // Create the answer 
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });


  // Whenever a new ICE candidate is added to the "offerCandidates" collection this listener will create a new ICE candidate locally.
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};


// 4) Hangup the call
hangupButton.onclick = async () => {
  pc.close();

  remoteStream.getTracks().forEach(function(track){
    track.stop();
  });
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(function(track) {
    track.stop();
  });
  webcamVideo.srcObject = localStream;

  callInput.value = "";

  webcamButton.disabled = false;
  WebcamDisableButton.disabled = true;
  hangupButton.disabled = true;
  callButton.disabled = true;
  answerButton.disabled = true;
}