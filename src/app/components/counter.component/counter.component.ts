import { Component, OnInit, ChangeDetectorRef, inject, EnvironmentInjector } from '@angular/core';
import { SignalingService } from '../../services/signaling.service';

@Component({
  selector: 'app-counter',
  standalone: false,
  templateUrl: './counter.component.html',
  styleUrls: ['./counter.component.scss']
})
export class CounterComponent implements OnInit {
  sessionKey = 'KIOSK-ABC123';
  counterSocketId = '';
  kioskId = '';
  peerConnection: RTCPeerConnection | null = null;
  dataChannel: RTCDataChannel | null = null;
  lastMessage = '';
  message = '';
  debugLogs: string[] = [];
  private injector = inject(EnvironmentInjector);

  constructor(
    private signalingService: SignalingService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.counterSocketId = await this.runInContext(() => this.signalingService.getSocketId());
    console.log('COUNTER socket id:', this.counterSocketId);
    this.debugLogs.push(`COUNTER socket id: ${this.counterSocketId}`);

    this.signalingService.on('session-joined').subscribe(async (data) => {
      console.log('Counter joined session:', data);
      this.debugLogs.push(`Counter joined session: ${JSON.stringify(data)}`);
      this.kioskId = data.kioskId;
      await this.createPeerConnection();
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      this.signalingService.emit('offer', {
        to: this.kioskId,
        from: this.counterSocketId,
        offer
      });
      console.log(`COUNTER sent OFFER to ${this.kioskId}`, offer);
      this.debugLogs.push(`COUNTER sent OFFER to ${this.kioskId}: ${JSON.stringify(offer)}`);
      this.cdr.detectChanges();
    });

    this.signalingService.on('answer').subscribe(async ({ from, answer }) => {
      console.log(`COUNTER got ANSWER from ${from}`, answer);
      this.debugLogs.push(`COUNTER got ANSWER from ${from}: ${JSON.stringify(answer)}`);
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        const bufferedCandidates = this.iceCandidateBuffer || [];
        for (const candidate of bufferedCandidates) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`COUNTER applying buffered ICE from ${from}`, candidate);
          this.debugLogs.push(`COUNTER applying buffered ICE from ${from}: ${JSON.stringify(candidate)}`);
        }
        this.iceCandidateBuffer = [];
      }
      this.cdr.detectChanges();
    });

    this.signalingService.on('ice-candidate').subscribe(async ({ from, candidate }) => {
      console.log(`COUNTER got ICE from ${from}`, candidate);
      this.debugLogs.push(`COUNTER got ICE from ${from}: ${JSON.stringify(candidate)}`);
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        console.log(`COUNTER buffering ICE candidate from ${from}`);
        this.debugLogs.push(`COUNTER buffering ICE candidate from ${from}`);
        this.iceCandidateBuffer.push(candidate);
      }
      this.cdr.detectChanges();
    });

    this.signalingService.on('session-error').subscribe(data => {
      console.error('Session error:', data.message);
      this.debugLogs.push(`Session error: ${data.message}`);
      this.cdr.detectChanges();
    });
  }

  private iceCandidateBuffer: RTCIceCandidateInit[] = [];

  private async runInContext<T>(fn: () => Promise<T>): Promise<T> {
    return this.injector.runInContext(fn);
  }

  async createPeerConnection() {
    try {
      const iceServers = await this.signalingService.getIceServers().toPromise();
      console.log(`Creating peer connection for kiosk ${this.kioskId} with ICE servers:`, iceServers);
      this.debugLogs.push(`Creating peer connection for kiosk ${this.kioskId} with ICE servers: ${JSON.stringify(iceServers)}`);
      this.peerConnection = new RTCPeerConnection({ iceServers });
      console.log(`Creating peer connection for kiosk ${this.kioskId}`);
      this.debugLogs.push(`Creating peer connection for kiosk ${this.kioskId}`);

      this.dataChannel = this.peerConnection.createDataChannel('chat');
      this.dataChannel.onopen = () => {
        console.log('COUNTER data channel open');
        this.debugLogs.push('COUNTER data channel open');
        this.cdr.detectChanges();
      };
      this.dataChannel.onmessage = (e) => {
        console.log(`COUNTER received message: ${e.data}`);
        this.debugLogs.push(`COUNTER received message: ${e.data}`);
        this.lastMessage = `From Kiosk: ${e.data}`;
        this.cdr.detectChanges();
      };
      this.dataChannel.onclose = () => {
        console.log('COUNTER data channel closed');
        this.debugLogs.push('COUNTER data channel closed');
        this.cdr.detectChanges();
      };

      this.peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          const counterId = await this.runInContext(() => this.signalingService.getSocketId());
          this.signalingService.emit('ice-candidate', {
            to: this.kioskId,
            from: counterId,
            candidate: event.candidate.toJSON()
          });
          console.log(`COUNTER sent ICE to ${this.kioskId}`, event.candidate);
          this.debugLogs.push(`COUNTER sent ICE to ${this.kioskId}: ${JSON.stringify(event.candidate)}`);
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log(`COUNTER ICE state: ${this.peerConnection!.iceConnectionState}`);
        this.debugLogs.push(`COUNTER ICE state: ${this.peerConnection!.iceConnectionState}`);
        if (this.peerConnection!.iceConnectionState === 'failed') {
          this.peerConnection!.restartIce();
        }
        this.cdr.detectChanges();
      };
    } catch (error: any) {
      console.error(`Failed to create peer connection for ${this.kioskId}:`, error);
      this.debugLogs.push(`Failed to create peer connection for ${this.kioskId}: ${error.message || error}`);
      this.cdr.detectChanges();
    }
  }

  async joinSession() {
    return this.runInContext(async () => {
      try {
        const counterId = await this.signalingService.getSocketId();
        this.signalingService.emit('join-session', {
          sessionKey: this.sessionKey,
          counterId
        });
      } catch (error: any) {
        console.error('Join session failed:', error);
        this.debugLogs.push(`Join session failed: ${error.message || error}`);
        this.cdr.detectChanges();
      }
    });
  }

  sendMessage() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(this.message);
      console.log(`COUNTER sent message: ${this.message}`);
      this.debugLogs.push(`COUNTER sent message: ${this.message}`);
      this.message = '';
      this.cdr.detectChanges();
    }
  }
}
