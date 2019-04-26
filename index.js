const Raspi = require('raspi');
const I2C = require('raspi-i2c').I2C;
const ADS1x15 = require('raspi-kit-ads1x15');

// initialization 
var GAIN = 2/3;
var curState = 0;
var thresh = 525;  // mid point in the waveform
var P = 512;
var T = 512;
var stateChanged = 0;
var sampleCounter = 0;
var lastBeatTime = 0;
var firstBeat = true;
var secondBeat = false;
var Pulse = false;
var IBI = 600;
var rate = new Array(10).fill(0);
var amp = 100;
var date = new Date();
var time = date.getTime();
var lastTime = parseInt(time);

var adc;
// Init Raspi
Raspi.init(() => {
    
    // Init Raspi-I2c
    const i2c = new I2C();
    
    // Init the ADC
    adc = new ADS1x15({
        i2c,                                    // i2c interface
        chip: ADS1x15.chips.IC_ADS1115,         // chip model
        address: ADS1x15.address.ADDRESS_0x48,  // i2c address on the bus
        
        // Defaults for future readings
        pga: ADS1x15.pga.PGA_4_096V,            // power-gain-amplifier range
        sps: ADS1x15.spsADS1015.SPS_250         // data rate (samples per second)
    });

    setInterval(() => {
        heartBeat();
    }, 500);
    
});

function readData(){
    // Get a single-ended reading from channel-0 and display the results
    return new Promise((resolve, reject) => {
        adc.readChannel(ADS1x15.channel.CHANNEL_0,{pga: 2/3}, (err, value, volts) => {
            if (err) {
                reject(err);
            } else {
                console.log(' * Value:' + value);    // will be a 11 or 15 bit integer depending on chip
                console.log(' * Volts:' + volts);    // voltage reading factoring in the PGA
                resolve(value);
            }
        });
    }); 
}

function heartBeat() {
    // read from the ADC
    // TODO: Select the correct ADC channel. I have selected A0 here
    readData().then((Signal) => {
        var date1 = new Date();
        var time1 = date1.getTime();
        var curTime = parseInt(time1);

        sampleCounter += curTime - lastTime; //  keep track of the time in mS with this variable
        lastTime = curTime;
    
        var N = sampleCounter - lastBeatTime; // monitor the time since the last beat to avoid noise

        console.log(`n: ${ N }, Signal: ${ Signal }, curTime: ${ curTime }, sampleCounter: ${sampleCounter}, lastBeatTime: ${lastBeatTime}`);
        // find the peak and trough of the pulse wave

        if (Signal < thresh && N > (IBI/5)*3) {  // avoid dichrotic noise by waiting 3/5 of last IBI
            if (Signal < T) {                        // T is the trough
                T = Signal;                         // keep track of lowest point in pulse wave 
            }
        }
        if(Signal > thresh &&  Signal > P){           // thresh condition helps avoid noise
            P = Signal;                            // P is the peak
        }                                        // keep track of highest point in pulse wave
    
        //  NOW IT'S TIME TO LOOK FOR THE HEART BEAT
        // signal surges up in value every time there is a pulse
        if(N > 250){                                   // avoid high frequency noise
            if((Signal > thresh) && (Pulse == false) && (N > (IBI/5.0)*3.0)) {
                Pulse = true;                               // set the Pulse flag when we think there is a pulse
                IBI = sampleCounter - lastBeatTime;         // measure time between beats in mS
                lastBeatTime = sampleCounter;               // keep track of time for next pulse
    
                if(secondBeat){                        // if this is the second beat, if secondBeat == TRUE
                    secondBeat = false;                  // clear secondBeat flag
                    for(var i=0; i<10; i++ ){             // seed the running total to get a realisitic BPM at startup
                        rate[i] = IBI;
                    }
                }
                if(firstBeat){                        // if it's the first time we found a beat, if firstBeat == TRUE
                    firstBeat = false;                   // clear firstBeat flag
                    secondBeat = true;                   // set the second beat flag
                    return;                              // IBI value is unreliable so discard it
                }
    
                // keep a running total of the last 10 IBI values
                runningTotal = 0;                  // clear the runningTotal variable    
    
                for(var i = 0; i<9; i++ ){                // shift data in the rate array
                    rate[i] = rate[i+1];                  // and drop the oldest IBI value 
                    runningTotal += rate[i];              // add up the 9 oldest IBI values
                }
                rate[9] = IBI;                          //  add the latest IBI to the rate array
                runningTotal += rate[9];                //  add the latest IBI to runningTotal
                runningTotal /= 10;                     //  average the last 10 IBI values 
                BPM = 60000/runningTotal;               //  how many beats can fit into a minute? that's BPM!
                console.log('BPM: ' + BPM);
            }
        }
        if((Signal < thresh) && (Pulse == true)){   //  when the values are going down, the beat is over
            Pulse = false;                         //  reset the Pulse flag so we can do it again
            amp = P - T;                           //  get amplitude of the pulse wave
            thresh = amp/2 + T;                    //  set thresh at 50% of the amplitude
            P = thresh;                            //  reset these for next time
            T = thresh;
        }
        if (N > 2500) {                          //  if 2.5 seconds go by without a beat
            thresh = 512;                          //  set thresh default
            P = 512;                               //  set P default
            T = 512;                               //  set T default
            lastBeatTime = sampleCounter;          //  bring the lastBeatTime up to date        
            firstBeat = true;                      //  set these to avoid noise
            secondBeat = false;                    //  when we get the heartbeat back
            console.log('no beats found');
        }
    })
    .catch((error) => {
        console.error('Failed to fetch value from ADC' + error);
    }); 
    
}
