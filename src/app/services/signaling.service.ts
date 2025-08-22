import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class SignalingService {
  private socket: Socket;
  private signalingUrl = 'https://webrtc-signaling-server-iota.vercel.app';
  private twilioTokenUrl = 'https://webrtc-signaling-server-iota.vercel.app/api/twilio-token';
  private eventSubjects = new Map<string, Subject<any>>();

  constructor(private http: HttpClient) {
    this.socket = io(this.signalingUrl, { autoConnect: true });
    this.socket.on('connect', () => {
      console.log('Connected to signaling server:', this.socket.id);
    });
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  on(event: string): Observable<any> {
    if (!this.eventSubjects.has(event)) {
      const subject = new Subject<any>();
      this.eventSubjects.set(event, subject);
      this.socket.on(event, (data: any) => subject.next(data));
    }
    return this.eventSubjects.get(event)!.asObservable();
  }

  emit(event: string, data: any) {
    this.socket.emit(event, data);
  }

  getSocketId(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.socket.id) {
        resolve(this.socket.id);
      } else {
        this.socket.on('connect', () => {
          if (this.socket.id) {
            resolve(this.socket.id);
          } else {
            reject(new Error('Socket ID not available after connect'));
          }
        });
        this.socket.on('connect_error', (error) => {
          reject(new Error(`Socket connection failed: ${error.message}`));
        });
      }
    });
  }

  getIceServers(): Observable<RTCIceServer[]> {
    return this.http.post<{ iceServers: RTCIceServer[] }>(this.twilioTokenUrl, {}).pipe(
      map(response => {
        console.log('Twilio token response:', response);
        if (!response || !Array.isArray(response.iceServers)) {
          throw new Error('Invalid iceServers: not an array');
        }
        return response.iceServers;
      }),
      catchError(error => {
        console.error('Failed to fetch ICE servers:', error);
        return throwError(() => new Error(`Failed to fetch ICE servers: ${error.message}`));
      })
    );
  }
}
