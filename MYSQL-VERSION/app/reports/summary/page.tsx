"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts"
import { Printer, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

type Top3Item = {
    rank: number
    level: string
    count: number
}

type ReportData = {
    monthLabel: string
    tableData: {
        level: string
        borrow: number
        read: number
        homework: number
        computer: number
        print: number
        total: number
        percentage: string
    }[]
    totals: {
        level: string
        borrow: number
        read: number
        homework: number
        computer: number
        print: number
        total: number
        percentage: string
    }
    top3: {
        reading: Top3Item[]
        print: Top3Item[]
        homework: Top3Item[]
    }
    pieChartData: {
        name: string
        value: number
        percentage: string
    }[]
}

// Updated Pastel Palette
const COLORS = [
    "#F87171", // Red 400
    "#FB923C", // Orange 400
    "#FACC15", // Yellow 400
    "#4ADE80", // Green 400
    "#2DD4BF", // Teal 400
    "#60A5FA", // Blue 400
    "#818CF8", // Indigo 400
    "#C084FC", // Purple 400
    "#F472B6", // Pink 400
    "#A78BFA", // Violet 400
    "#34D399", // Emerald 400
    "#FBBF24"  // Amber 400
]

const formatFullGrade = (level: string) => {
    if (!level) return "-"
    if (level.startsWith("ป.")) return `ประถมศึกษาปีที่ ${level.replace("ป.", "")}`
    if (level.startsWith("ม.")) return `มัธยมศึกษาปีที่ ${level.replace("ม.", "")}`
    return level
}

export default function SummaryReportPage() {
    const router = useRouter()
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedMonth, setSelectedMonth] = useState("")

    useEffect(() => {
        const now = new Date()
        const y = now.getFullYear()
        const m = String(now.getMonth() + 1).padStart(2, "0")
        setSelectedMonth(`${y}-${m}`)
    }, [])
    const [isPrinting, setIsPrinting] = useState(false)

    useEffect(() => {
        const before = () => setIsPrinting(true)
        const after = () => setIsPrinting(false)

        window.addEventListener("beforeprint", before)
        window.addEventListener("afterprint", after)

        return () => {
            window.removeEventListener("beforeprint", before)
            window.removeEventListener("afterprint", after)
        }
    }, [])

    useEffect(() => {
        if (!selectedMonth) return

        const fetchData = async () => {
            setLoading(true)
            try {
                const res = await fetch(`/api/reports/summary?month=${selectedMonth}`)
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                }
            } catch (error) {
                console.error("Failed to fetch report:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
    }, [selectedMonth])

    const handlePrint = () => {
        window.print()
    }

    if (loading && !data) {
        return <div className="p-8 text-center bg-gray-50 min-h-screen flex items-center justify-center">Loading Report...</div>
    }

    if (!data) {
        return <div className="p-8 text-center text-red-500 bg-gray-50 min-h-screen flex items-center justify-center">Failed to load report data.</div>
    }

    return (
        <div className="min-h-screen bg-gray-100 flex justify-center p-8 print:p-0 print:bg-white text-black font-sans">
            <div className="w-full max-w-[210mm] print:max-w-none print:w-full bg-white shadow-lg print:shadow-none p-8 print:p-4 box-border">

                {/* Controls - Hidden when printing */}
                <div className="print:hidden mb-8 flex gap-4 items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <Button
                        onClick={() => router.push("/")}
                        variant="outline"
                        className="gap-2 bg-white hover:bg-gray-50 text-gray-700 border-blue-200"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        ย้อนกลับ
                    </Button>

                    <div className="flex items-center gap-2 flex-1 justify-end">
                        <span className="text-sm font-semibold text-blue-900">ประจำเดือน:</span>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <Button onClick={handlePrint} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm">
                        <Printer className="w-4 h-4" />
                        พิมพ์รายงาน
                    </Button>
                </div>

                {/* Report Header */}
                <div className="text-center mb-8 print:mb-2">
                    <h1 className="text-2xl font-bold text-gray-900 mb-1 print:text-xl">สรุปการเข้าใช้บริการห้องสมุด ประจำเดือน {data.monthLabel}</h1>
                </div>

                {/* Print Layout Wrapper: Stacked in Portrait */}
                <div className="flex flex-col print:block">

                    {/* Main Stats Table */}
                    <div className="mb-8 border border-gray-400 text-sm print:mb-4 print:text-[10px] print:w-full">
                        {/* Table Header */}
                        <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))_0.8fr_0.8fr] divide-x divide-gray-400 bg-gray-200 text-center font-bold border-b border-gray-400 text-gray-800">
                            <div className="p-3 print:p-1 flex items-center justify-center">การเข้าบริการ / ระดับชั้น</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">ยืม - คืนหนังสือ</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">อ่านหนังสือ</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">ทำการบ้าน<br />และรายงาน</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">ใช้บริการ<br />คอมพิวเตอร์</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">ปริ้นงาน /<br />ถ่ายเอกสาร</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">รวม</div>
                            <div className="p-2 print:p-1 flex items-center justify-center">ร้อยละ</div>
                        </div>

                        {/* Table Rows */}
                        {data.tableData.map((row, index) => (
                            <div key={row.level} className={`grid grid-cols-[1fr_repeat(5,minmax(0,1fr))_0.8fr_0.8fr] divide-x divide-gray-400 border-b border-gray-400 last:border-b-0 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                <div className="p-2 print:p-1 text-center font-semibold bg-gray-100/50 text-gray-700">{row.level}</div>
                                <div className="p-2 print:p-1 text-center">{row.borrow || "-"}</div>
                                <div className="p-2 print:p-1 text-center">{row.read || "-"}</div>
                                <div className="p-2 print:p-1 text-center">{row.homework || "-"}</div>
                                <div className="p-2 print:p-1 text-center">{row.computer || "-"}</div>
                                <div className="p-2 print:p-1 text-center">{row.print || "-"}</div>
                                <div className="p-2 print:p-1 text-center font-bold bg-gray-50">{row.total}</div>
                                <div className="p-2 print:p-1 text-center text-gray-600">{row.percentage}</div>
                            </div>
                        ))}

                        {/* Totals Row */}
                        <div className="grid grid-cols-[1fr_repeat(5,minmax(0,1fr))_0.8fr_0.8fr] divide-x divide-gray-400 bg-amber-100 border-t border-gray-400 font-bold text-gray-900">
                            <div className="p-3 print:p-1 text-center">รวม</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.borrow}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.read}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.homework}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.computer}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.print}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.total.toLocaleString()}</div>
                            <div className="p-3 print:p-1 text-center">{data.totals.percentage}</div>
                        </div>
                    </div>

                    {/* Bottom Section: Top 3 & Chart Summary */}
                    <div className="mt-8 print:mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-[1fr_1fr] print:gap-4 items-start">

                            {/* Top 3 Stats Cards - Print: Clean List */}
                            <div className="space-y-4 print:space-y-2">
                                <h2 className="text-lg font-bold text-gray-900 border-b-2 border-blue-500 pb-1 inline-block print:text-sm print:pb-0 print:border-b print:mb-1">
                                    3 อันดับสูงสุด แยกตามประเภท
                                </h2>

                                {/* Card: Reading */}
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 print:bg-white print:border print:border-gray-300 print:p-2 print:rounded-md">
                                    <h3 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2 uppercase tracking-wide print:text-black print:text-xs print:mb-1">
                                        <span className="w-2 h-2 bg-blue-500 rounded-full print:hidden"></span>
                                        <span className="print:font-bold">การอ่าน</span>
                                    </h3>
                                    <div className="flex flex-wrap gap-2 text-sm text-gray-700 print:text-xs print:gap-1">
                                        {data.top3.reading.length > 0 ? data.top3.reading.slice(0, 3).map((item, i) => (
                                            <div key={i} className="flex items-center bg-white px-2 py-1 rounded border border-blue-200 print:border-none print:p-0 print:bg-transparent">
                                                <span className="font-bold text-blue-600 mr-1 print:text-black">{i + 1}.</span>
                                                <span className="print:font-semibold">{item.level}</span>
                                                <span className="text-gray-500 text-xs ml-1 print:text-black">({item.count})</span>
                                            </div>
                                        )) : <span className="text-gray-400">- ไม่มีข้อมูล -</span>}
                                    </div>
                                </div>

                                {/* Card: Print */}
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100 print:bg-white print:border print:border-gray-300 print:p-2 print:rounded-md">
                                    <h3 className="font-bold text-green-800 text-sm mb-2 flex items-center gap-2 uppercase tracking-wide print:text-black print:text-xs print:mb-1">
                                        <span className="w-2 h-2 bg-green-500 rounded-full print:hidden"></span>
                                        <span className="print:font-bold">ปริ้นงาน / ถ่ายเอกสาร</span>
                                    </h3>
                                    <div className="flex flex-wrap gap-2 text-sm text-gray-700 print:text-xs print:gap-1">
                                        {data.top3.print.length > 0 ? data.top3.print.slice(0, 3).map((item, i) => (
                                            <div key={i} className="flex items-center bg-white px-2 py-1 rounded border border-green-200 print:border-none print:p-0 print:bg-transparent">
                                                <span className="font-bold text-green-600 mr-1 print:text-black">{i + 1}.</span>
                                                <span className="print:font-semibold">{item.level}</span>
                                                <span className="text-gray-500 text-xs ml-1 print:text-black">({item.count})</span>
                                            </div>
                                        )) : <span className="text-gray-400">- ไม่มีข้อมูล -</span>}
                                    </div>
                                </div>

                                {/* Card: Homework */}
                                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 print:bg-white print:border print:border-gray-300 print:p-2 print:rounded-md">
                                    <h3 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2 uppercase tracking-wide print:text-black print:text-xs print:mb-1">
                                        <span className="w-2 h-2 bg-amber-500 rounded-full print:hidden"></span>
                                        <span className="print:font-bold">การบ้าน</span>
                                    </h3>
                                    <div className="flex flex-wrap gap-2 text-sm text-gray-700 print:text-xs print:gap-1">
                                        {data.top3.homework.length > 0 ? data.top3.homework.slice(0, 3).map((item, i) => (
                                            <div key={i} className="flex items-center bg-white px-2 py-1 rounded border border-amber-200 print:border-none print:p-0 print:bg-transparent">
                                                <span className="font-bold text-amber-600 mr-1 print:text-black">{i + 1}.</span>
                                                <span className="print:font-semibold">{item.level}</span>
                                                <span className="text-gray-500 text-xs ml-1 print:text-black">({item.count})</span>
                                            </div>
                                        )) : <span className="text-gray-400">- ไม่มีข้อมูล -</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Chart Section - Bar Chart */}
                            <div className="flex flex-col items-center justify-start h-full pt-4 print:pt-0">
                                <div className="w-full h-[350px] print:h-[250px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={data.tableData}
                                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis
                                                dataKey="level"
                                                tick={({ x, y, payload }) => (
                                                    <g transform={`translate(${x},${y})`}>
                                                        <text x={0} y={0} dy={16} textAnchor="middle" fill="#374151" className="text-xs font-medium">
                                                            {payload.value}
                                                        </text>
                                                    </g>
                                                )}
                                                axisLine={{ stroke: '#9ca3af' }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#6b7280', fontSize: 12 }}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: '#f3f4f6' }}
                                                content={({ active, payload, label }) => {
                                                    if (active && payload && payload.length) {
                                                        return (
                                                            <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                                                                <p className="font-bold text-gray-900 mb-1">{label}</p>
                                                                <p className="text-blue-600 font-semibold">
                                                                    {payload[0].value} ครั้ง
                                                                </p>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                }}
                                            />
                                            <Bar
                                                dataKey="total"
                                                fill="#3b82f6"
                                                radius={[4, 4, 0, 0]}
                                                barSize={30}
                                                name="จำนวนผู้เข้าใช้"
                                            >
                                                {/* Optional: Color bars by grade group if desired, or keep uniform blue */}
                                                {data?.tableData?.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.level.includes('ป.') ? '#60A5FA' : '#818CF8'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-center text-sm font-semibold text-gray-500 mt-2 print:mt-24 print:text-[10px]">
                                    แผนภูมิแสดงจำนวนผู้เข้าใช้บริการแยกตามระดับชั้น (ป.1 - ม.6)
                                </p>
                            </div>
                        </div>
                    </div>

                    <style jsx global>{`
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 10mm;
                        }
                        html, body {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                            background: #ffffff !important;
                        }
                        .print\\:hidden {
                            display: none !important;
                        }
                        .print\\:shadow-none {
                            box-shadow: none !important;
                        }
                        .print\\:p-0 {
                            padding: 0 !important;
                        }
                        .print\\:w-full {
                            width: 100% !important;
                        }
                        /* Clean Text Colors */
                        * {
                            color: #000 !important;
                            text-shadow: none !important;
                        }
                        .text-gray-500, .text-gray-400 {
                            color: #6b7280 !important;
                        }
                    }
                `}</style>
                </div>
                {/* End Print Layout Wrapper */}
            </div>
        </div>
    )
}
